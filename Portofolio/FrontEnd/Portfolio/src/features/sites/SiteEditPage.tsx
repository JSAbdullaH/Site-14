import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Check, Circle, Clock, MapPinned, Moon, Sun, Users } from "lucide-react";
import type { ReactNode } from "react";
import AppShell from "@/shared/components/AppShell";
import FormField from "@/shared/components/FormField";
import { ApiError } from "@/shared/lib/api";
import { isAdmin } from "@/shared/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { LatLng, LngLat, Polygon } from "@/features/map/types";
import BoundaryPicker from "./components/BoundaryPicker";
import SiteEmployees from "./components/SiteEmployees";
import DeactivateSiteDialog from "./components/DeactivateSiteDialog";
import { createSite, deactivateSite, getSite, setActiveSiteId, updateSite } from "./api";
import type { Site } from "./types";
import { selfIntersects } from "./geometry";

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

// Minutes from start to end, across midnight for a night shift.
function shiftMinutes(start: string, end: string) {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  return (toMin(end) - toMin(start) + 1440) % 1440;
}

const durationText = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

function Card({ step, icon, title, description, action, children }: {
  step?: number;
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          {icon}
          {step !== undefined && (
            <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {step}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className="px-5 pt-5">{children}</div>
    </section>
  );
}

function ChecklistItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-2.5 text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>
      {done ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-ok text-white">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : (
        <Circle className="size-5 text-border" />
      )}
      {children}
    </li>
  );
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
    if (!name.trim()) local.name = "Give the site a name";
    if (!ring) local.boundary = "error" in parsed ? parsed.error : "Mark the corners of the site";
    else if (selfIntersects(corners)) local.boundary = "The outline crosses itself. Use Fix shape under the map.";
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

  const [closing, setClosing] = useState(false);

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

  // Shown once Create or Save is pressed; while drawing, the hint on the map guides instead.
  const cornersError = fields.boundary;
  const minutes = shiftMinutes(shiftStart, shiftEnd);
  const night = shiftEnd < shiftStart;
  const ready = {
    name: name.trim().length > 0,
    boundary: Boolean(ring) && !selfIntersects(corners),
    hours: shiftStart !== shiftEnd,
  };
  const readyCount = Object.values(ready).filter(Boolean).length;

  return (
    <AppShell
      title={editing ? site?.name ?? "Site" : "New site"}
      subtitle={
        editing
          ? [site?.display_id, site?.client].filter(Boolean).join(" · ") || undefined
          : "A project with its own perimeter and shift"
      }
    >
      {back}

      {editing && !site ? (
        <div className="grid max-w-[1200px] gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[560px]" />
        </div>
      ) : (
        <>
          <form
            onSubmit={submit}
            noValidate
            className="grid max-w-[1200px] items-start gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]"
          >
            <div className="contents min-w-0 lg:sticky lg:top-6 lg:grid lg:gap-6">
              {formError && (
                <p className="rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger" role="alert">
                  {formError}
                </p>
              )}
              {notice && (
                <p className="rounded-md bg-ok-bg px-4 py-3 text-sm font-medium text-ok" role="status">
                  {notice}
                </p>
              )}

              <Card step={1} icon={<Building2 className="size-4" />} title="Site details" description="How the site appears across SITE14.">
                <FormField
                  id="name"
                  label="Site name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFields((f) => ({ ...f, name: undefined }));
                  }}
                  required
                  maxLength={120}
                  placeholder="Al Malqa Tower"
                  error={fields.name}
                />
                <FormField
                  id="client"
                  label="Client"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  maxLength={150}
                  placeholder="Optional: who the project is for"
                  error={fields.client}
                />
              </Card>

              <Card
                step={2}
                icon={<Clock className="size-4" />}
                title="Working hours"
                description="Hours worked outside them count as overtime."
                action={
                  shiftStart !== shiftEnd && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                      {night ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
                      {durationText(minutes)}
                    </span>
                  )
                }
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    id="shift-start"
                    label="Starts"
                    type="time"
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    required
                    error={fields.shift_start}
                  />
                  <FormField
                    id="shift-end"
                    label="Ends"
                    type="time"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    required
                    error={fields.shift_end}
                  />
                </div>
                {night && shiftStart !== shiftEnd && (
                  <p className="-mt-2 mb-5 text-sm text-muted-foreground">Night shift: it ends the next morning.</p>
                )}
              </Card>

              <section className="order-last rounded-xl border bg-card p-5 lg:order-none">
                {!editing && (
                  <>
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="font-semibold">Ready to create</span>
                      <span className="text-muted-foreground tabular-nums">{readyCount} of 3</span>
                    </div>
                    <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(readyCount / 3) * 100}%` }} />
                    </div>
                    <ul className="mb-5 grid gap-2.5">
                      <ChecklistItem done={ready.name}>A site name</ChecklistItem>
                      <ChecklistItem done={ready.hours}>Working hours</ChecklistItem>
                      <ChecklistItem done={ready.boundary}>A boundary with at least 3 corners</ChecklistItem>
                      <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <Users className="size-5 p-0.5" />
                        Then assign employees to it
                      </li>
                    </ul>
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" disabled={busy} className="flex-1">
                    {busy ? "Saving..." : editing ? "Save changes" : "Create site"}
                  </Button>
                  {editing && site ? (
                    <Button
                      type="button"
                      variant={site.is_active ? "destructive" : "outline"}
                      disabled={busy}
                      onClick={() => (site.is_active ? setClosing(true) : setActive(true))}
                    >
                      {site.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" onClick={() => navigate("/sites")}>
                      Cancel
                    </Button>
                  )}
                </div>
              </section>
            </div>

            <Card
              step={3}
              icon={<MapPinned className="size-4" />}
              title="Site boundary"
              description="Search the address, then click the corners of the site in any order. Drag a corner to move it; click it to remove it."
            >
              <div className="pb-5">
                <BoundaryPicker
                  corners={corners}
                  onChange={(next) => {
                    setCorners(next);
                    setFields((f) => ({ ...f, boundary: undefined }));
                  }}
                  invalid={Boolean(cornersError)}
                  className="h-[420px] lg:h-[560px]"
                />
                {cornersError && <p className="mt-2 text-sm font-medium text-destructive">{cornersError}</p>}
              </div>
            </Card>
          </form>

          {editing && site && (
            <>
              <DeactivateSiteDialog
                site={closing ? site : null}
                onClose={() => setClosing(false)}
                onDeactivated={() => {
                  setSite({ ...site, is_active: false });
                  setNotice(`${site.name} is deactivated. Its records are kept.`);
                }}
              />
              <div className="mt-6 max-w-[1200px]">
                <SiteEmployees siteId={site.id} siteActive={site.is_active} onChange={refreshSite} />
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
