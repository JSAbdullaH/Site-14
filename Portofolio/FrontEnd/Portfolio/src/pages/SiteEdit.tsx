import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Input from "../components/Input";
import SiteEmployees from "../components/SiteEmployees";
import { ApiError, apiFetch } from "../lib/api";
import { isAdmin } from "../lib/auth";
import { useSites } from "../lib/sites";
import type { Polygon, Site } from "../lib/sites";

type Fields = Partial<Record<"name" | "client" | "shift_start" | "shift_end" | "boundary", string>>;

const MAX_CORNERS = 499;

// One corner per line, "latitude, longitude", the order Google Maps copies them in.
// Returns a closed GeoJSON ring ([longitude, latitude] pairs) or the reason it is invalid.
function parseCorners(text: string): { ring: [number, number][] } | { error: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const ring: [number, number][] = [];
  for (const [i, line] of lines.entries()) {
    const parts = line.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
      return { error: `Line ${i + 1}: write the corner as "latitude, longitude"` };
    }
    const [lat, lng] = parts;
    if (lat < -90 || lat > 90) return { error: `Line ${i + 1}: latitude must be between -90 and 90` };
    if (lng < -180 || lng > 180) return { error: `Line ${i + 1}: longitude must be between -180 and 180` };
    ring.push([lng, lat]);
  }
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first && (first[0] !== last[0] || first[1] !== last[1])) ring.push([first[0], first[1]]);
  const distinct = new Set(ring.slice(0, -1).map((p) => p.join(","))).size;
  if (distinct < 3) return { error: "Enter at least three different corners" };
  if (ring.length - 1 > MAX_CORNERS) return { error: `Use at most ${MAX_CORNERS} corners` };
  return { ring };
}

function cornersText(boundary: Polygon): string {
  const ring = boundary.coordinates[0] ?? [];
  const open = ring.length > 1 ? ring.slice(0, -1) : ring;
  return open.map(([lng, lat]) => `${lat}, ${lng}`).join("\n");
}

// A small outline of the perimeter, so a typo in a corner is visible before saving.
function BoundaryPreview({ ring }: { ring: [number, number][] }) {
  const size = 200;
  const pad = 12;
  const lats = ring.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  // Longitude degrees shrink toward the poles; scale them so the shape is not stretched.
  const xs = ring.map((p) => p[0] * Math.cos((midLat * Math.PI) / 180));
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...lats), Math.max(...lats)];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const scale = (size - pad * 2) / span;
  const points = ring
    .map((p, i) => `${pad + (xs[i] - minX) * scale},${size - pad - (p[1] - minY) * scale}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px] aspect-square rounded-ctrl bg-sand" role="img" aria-label="Boundary outline">
      <polygon points={points} className="fill-signal/15 stroke-signal" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

export default function SiteEdit() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { reload, setActiveSiteId } = useSites();

  const [site, setSite] = useState<Site | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [shiftStart, setShiftStart] = useState("07:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [corners, setCorners] = useState("");
  const [fields, setFields] = useState<Fields>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let stale = false;
    setSite(null);
    setLoadError("");
    apiFetch<Site>(`/sites/${id}`)
      .then((s) => {
        if (stale) return;
        setSite(s);
        setName(s.name);
        setClient(s.client ?? "");
        setShiftStart(s.shift_start);
        setShiftEnd(s.shift_end);
        setCorners(cornersText(s.boundary));
      })
      .catch((err) => {
        if (!stale) setLoadError((err as Error).message);
      });
    return () => {
      stale = true;
    };
  }, [id]);

  if (!isAdmin()) return <Navigate to="/sites" replace />;

  const parsed = parseCorners(corners);
  const ring = "ring" in parsed ? parsed.ring : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setNotice("");
    const local: Fields = {};
    if (!ring) local.boundary = "error" in parsed ? parsed.error : "Enter the corners of the site";
    if (shiftStart === shiftEnd) local.shift_end = "The shift must end at a different time than it starts";
    setFields(local);
    if (Object.keys(local).length || !ring) return;

    const body = {
      name,
      client: client.trim() || null,
      boundary: { type: "Polygon", coordinates: [ring] },
      shift_start: shiftStart,
      shift_end: shiftEnd,
    };
    setBusy(true);
    try {
      const saved = await apiFetch<Site>(editing ? `/sites/${id}` : "/sites", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      await reload();
      if (editing) {
        setSite(saved);
        setNotice(`Saved the changes to ${saved.name}.`);
      } else {
        // Switch to the new site, and stay on it to assign its employees.
        setActiveSiteId(saved.id);
        navigate(`/sites/${saved.id}`, { replace: true });
      }
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  }

  // Field errors go under their field; "boundary.coordinates.0.2.1" and the like go under the corners.
  function showError(err: unknown) {
    const known = ["name", "client", "shift_start", "shift_end", "boundary"];
    const next: Fields = {};
    let other = "";
    if (err instanceof ApiError) {
      for (const [key, message] of Object.entries(err.fields)) {
        const field = key.startsWith("boundary") ? "boundary" : key;
        if (known.includes(field)) next[field as keyof Fields] ??= message;
        else other ||= message;
      }
    }
    setFields(next);
    setFormError(other || (Object.keys(next).length ? "Check the highlighted fields." : (err as Error).message));
  }

  async function setActive(active: boolean) {
    if (!site) return;
    setFormError("");
    setNotice("");
    setBusy(true);
    try {
      if (active) {
        setSite(await apiFetch<Site>(`/sites/${site.id}`, { method: "PATCH", body: JSON.stringify({ is_active: true }) }));
      } else {
        await apiFetch(`/sites/${site.id}`, { method: "DELETE" });
        setSite({ ...site, is_active: false });
      }
      setNotice(active ? `${site.name} is active again.` : `${site.name} is deactivated. Its records are kept.`);
      await reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshCounts() {
    await reload();
  }

  const title = editing ? site?.name ?? "Site" : "New site";

  if (editing && loadError) {
    return (
      <AppShell title="Site">
        <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">{loadError}</p>
        <Link to="/sites" className="text-sm font-bold hover:text-signal">← Back to sites</Link>
      </AppShell>
    );
  }

  const fieldError = (key: keyof Fields) =>
    fields[key] && <p className="-mt-4 mb-6 text-[13px] font-bold text-signal-dark">{fields[key]}</p>;

  return (
    <AppShell title={title} subtitle={editing ? site?.client ?? undefined : "A project with its own perimeter and shift"}>
      <Link to="/sites" className="inline-block mb-6 text-sm font-bold text-muted hover:text-signal">← All sites</Link>

      {editing && !site ? (
        <div className="max-w-[1040px] h-96 rounded-card bg-sand animate-pulse" />
      ) : (
        <div className="max-w-[1040px] grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <form onSubmit={submit} noValidate className="bg-white rounded-card p-8">
            <h2 className="text-xl font-bold mb-6">Site details</h2>

            {formError && (
              <p className="mb-5 px-4 py-3 rounded-ctrl bg-orange-bg text-signal-dark text-sm font-bold">{formError}</p>
            )}
            {notice && (
              <p className="mb-5 px-4 py-3 rounded-ctrl bg-green-bg text-zone-green text-sm font-bold" role="status">
                {notice}
              </p>
            )}

            <Input id="name" label="SITE NAME" value={name} onChange={(e) => setName(e.target.value)}
              required maxLength={120} placeholder="Al Malqa Tower" />
            {fieldError("name")}

            <Input id="client" label="CLIENT (OPTIONAL)" value={client} onChange={(e) => setClient(e.target.value)}
              maxLength={150} placeholder="Who the project is built for" />
            {fieldError("client")}

            <div className="grid grid-cols-2 gap-4">
              <Input id="shift-start" label="SHIFT STARTS" type="time" value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)} required />
              <Input id="shift-end" label="SHIFT ENDS" type="time" value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)} required />
            </div>
            {fieldError("shift_start")}
            {fieldError("shift_end")}
            {shiftEnd < shiftStart && shiftStart !== shiftEnd && (
              <p className="-mt-4 mb-6 text-[13px] font-semibold text-mute2">Night shift: it ends the next morning.</p>
            )}

            <label htmlFor="corners" className="block mb-2.5 text-[11px] font-bold tracking-[0.1em] text-mute2">
              BOUNDARY CORNERS
            </label>
            <p className="mb-3 text-[13px] text-muted font-semibold">
              One corner per line as <span className="text-ink">latitude, longitude</span>, in order around the site.
              Right-click a point in Google Maps to copy it.
            </p>
            <div className="mb-6 flex flex-col sm:flex-row gap-4">
              <textarea
                id="corners"
                value={corners}
                onChange={(e) => setCorners(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={"24.8150, 46.6260\n24.8150, 46.6320\n24.8090, 46.6320\n24.8090, 46.6260"}
                className="flex-1 min-w-0 px-5 py-3 rounded-ctrl bg-sand text-ink text-[14px] font-semibold font-mono border border-transparent outline-none placeholder:text-mute2 focus:border-signal"
              />
              {ring && <BoundaryPreview ring={ring} />}
            </div>
            {(fields.boundary || (corners.trim() && "error" in parsed)) && (
              <p className="-mt-4 mb-6 text-[13px] font-bold text-signal-dark">
                {fields.boundary ?? ("error" in parsed ? parsed.error : "")}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : editing ? "Save changes" : "Create site"}
              </Button>
              {editing && site && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setActive(!site.is_active)}>
                  {site.is_active ? "Deactivate site" : "Reactivate site"}
                </Button>
              )}
            </div>
          </form>

          {editing && site ? (
            <SiteEmployees siteId={site.id} siteActive={site.is_active} onChange={refreshCounts} />
          ) : (
            <section className="bg-bone rounded-card p-8">
              <h2 className="text-lg font-bold mb-2">Next: assign employees</h2>
              <p className="text-[15px] text-muted font-semibold leading-relaxed">
                After the site is created you can assign workers to it here. Their hours, alerts and
                reports are then recorded against this project, separately from your other sites.
              </p>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
