import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import FormField from "@/shared/components/FormField";
import { ApiError } from "@/shared/lib/api";
import { isAdmin } from "@/shared/lib/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { LatLng, LngLat, Polygon } from "@/features/map/types";
import BoundaryPicker from "./components/BoundaryPicker";
import SiteEmployees from "./components/SiteEmployees";
import { createSite, deactivateSite, getSite, setActiveSiteId, updateSite } from "./api";
import type { Site } from "./types";

type Field = "name" | "client" | "shift_start" | "shift_end" | "boundary";
type Fields = Partial<Record<Field, string>>;

const FIELDS: Field[] = ["name", "client", "shift_start", "shift_end", "boundary"];
const MAX_CORNERS = 499;

// The picked corners as a closed GeoJSON ring ([longitude, latitude] pairs), or the reason it is invalid.
function toRing(corners: LatLng[]): { ring: LngLat[] } | { error: string } {
  const distinct = new Set(corners.map((p) => `${p.lat},${p.lng}`)).size;
  if (distinct < 3) return { error: "Click at least three corners on the map" };
  if (corners.length > MAX_CORNERS) return { error: `Use at most ${MAX_CORNERS} corners` };
  const ring: LngLat[] = corners.map((p) => [p.lng, p.lat]);
  ring.push([ring[0][0], ring[0][1]]);
  return { ring };
}

function boundaryCorners(boundary: Polygon): LatLng[] {
  const ring = boundary.coordinates[0] ?? [];
  const open = ring.length > 1 ? ring.slice(0, -1) : ring;
  return open.map(([lng, lat]) => ({ lat, lng }));
}

// SITE-47, SITE-48: create a site, or edit one and assign its employees (SITE-49).
export default function SiteEditPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [site, setSite] = useState<Site | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [shiftStart, setShiftStart] = useState("07:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [corners, setCorners] = useState<LatLng[]>([]);
  const [fields, setFields] = useState<Fields>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function fill(s: Site) {
    setSite(s);
    setName(s.name);
    setClient(s.client ?? "");
    setShiftStart(s.shift_start);
    setShiftEnd(s.shift_end);
    setCorners(boundaryCorners(s.boundary));
  }

  useEffect(() => {
    if (!id) return;
    let stale = false;
    getSite(id)
      .then((s) => {
        if (!stale) fill(s);
      })
      .catch((err) => {
        if (!stale) setLoadError((err as Error).message);
      });
    return () => {
      stale = true;
    };
  }, [id]);

  if (!isAdmin()) return <Navigate to="/sites" replace />;

  const parsed = toRing(corners);
  const ring = "ring" in parsed ? parsed.ring : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setNotice("");
    const local: Fields = {};
    if (!ring) local.boundary = "error" in parsed ? parsed.error : "Mark the corners of the site";
    if (shiftStart === shiftEnd) local.shift_end = "The shift must end at a different time than it starts";
    setFields(local);
    if (Object.keys(local).length || !ring) return;

    const body = {
      name,
      client: client.trim() || null,
      boundary: { type: "Polygon" as const, coordinates: [ring] },
      shift_start: shiftStart,
      shift_end: shiftEnd,
    };
    setBusy(true);
    try {
      if (editing && id) {
        const saved = await updateSite(id, body);
        fill(saved);
        setNotice(`Saved the changes to ${saved.name}.`);
      } else {
        // Switch to the new site, and stay on it to assign its employees.
        const saved = await createSite(body);
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
    const next: Fields = {};
    let other = "";
    if (err instanceof ApiError) {
      for (const [key, message] of Object.entries(err.fields)) {
        const field = (key.startsWith("boundary") ? "boundary" : key) as Field;
        if (FIELDS.includes(field)) next[field] ??= message;
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
        setSite(await updateSite(site.id, { is_active: true }));
      } else {
        await deactivateSite(site.id);
        setSite({ ...site, is_active: false });
      }
      setNotice(active ? `${site.name} is active again.` : `${site.name} is deactivated. Its records are kept.`);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // An assignment changes the site's employee count.
  function refreshSite() {
    if (id) getSite(id).then(setSite).catch(() => {});
  }

  const back = (
    <Link
      to="/sites"
      className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
    >
      <ArrowLeft className="size-4" />
      All sites
    </Link>
  );

  if (editing && loadError) {
    return (
      <AppShell title="Site">
        {back}
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{loadError}</p>
      </AppShell>
    );
  }

  const cornersError = fields.boundary ?? (corners.length && "error" in parsed ? parsed.error : undefined);

  return (
    <AppShell
      title={editing ? site?.name ?? "Site" : "New site"}
      subtitle={editing ? site?.client ?? undefined : "A project with its own perimeter and shift"}
    >
      {back}

      {editing && !site ? (
        <Skeleton className="h-96 w-full max-w-[1040px]" />
      ) : (
        <div className="grid max-w-[1040px] items-start gap-6 lg:grid-cols-2">
          <form onSubmit={submit} noValidate className="rounded-xl border bg-card p-8">
            <h2 className="mb-6 text-xl font-semibold">Site details</h2>

            {formError && (
              <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
                {formError}
              </p>
            )}
            {notice && (
              <p className="mb-5 rounded-md bg-ok-bg px-4 py-3 text-sm font-medium text-ok" role="status">
                {notice}
              </p>
            )}

            <FormField
              id="name"
              label="Site name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="Al Malqa Tower"
              error={fields.name}
            />

            <FormField
              id="client"
              label="Client (optional)"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              maxLength={150}
              placeholder="Who the project is built for"
              error={fields.client}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                id="shift-start"
                label="Shift starts"
                type="time"
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                required
                error={fields.shift_start}
              />
              <FormField
                id="shift-end"
                label="Shift ends"
                type="time"
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                required
                error={fields.shift_end}
                hint={shiftEnd < shiftStart ? "Night shift: it ends the next morning." : undefined}
              />
            </div>

            <div className="mb-6 grid gap-2">
              <Label>Site boundary</Label>
              <p className="text-sm text-muted-foreground">
                Click the map at each corner of the site, in order around it. Drag a corner to move it,
                or click it to remove it.
              </p>
              <BoundaryPicker corners={corners} onChange={setCorners} invalid={Boolean(cornersError)} />
              {cornersError && <p className="text-sm font-medium text-destructive">{cornersError}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving..." : editing ? "Save changes" : "Create site"}
              </Button>
              {editing && site && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => setActive(!site.is_active)}>
                  {site.is_active ? "Deactivate site" : "Reactivate site"}
                </Button>
              )}
            </div>
          </form>

          {editing && site ? (
            <SiteEmployees siteId={site.id} siteActive={site.is_active} onChange={refreshSite} />
          ) : (
            <section className="rounded-xl border bg-secondary p-8">
              <h2 className="mb-2 text-lg font-semibold">Next: assign employees</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
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
