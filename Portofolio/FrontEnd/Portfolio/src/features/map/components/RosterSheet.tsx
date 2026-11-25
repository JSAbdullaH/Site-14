import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { BatteryLow, ChevronDown, ChevronUp, PanelLeftClose, Search, Users, WifiOff, X } from "lucide-react";
import type { LiveStatus, LiveWorker } from "../api";
import { GROUPS, STATUS, STATUS_ORDER, countByStatus } from "./status";
import { GLASS, ago, initials } from "./format";

type Props = {
  workers: LiveWorker[];
  onMapIds: Set<string>;
  filter: LiveStatus | null;
  selectedId: string | null;
  now: number;
  onSelect: (worker: LiveWorker) => void;
  onHover: (id: string | null) => void;
  onClearFilter: () => void;
  /** Phones and tablets: the sheet steps aside while a worker or zone panel is open. */
  hiddenOnSmall?: boolean;
  /** Wide screens: the sidebar is folded away, giving the map the full width. */
  collapsed?: boolean;
  onCollapse?: () => void;
};

const DRAG_THRESHOLD = 28;

function detail(w: LiveWorker, now: number) {
  if (w.status === "out_of_zone" && w.out_of_zone) return `Left ${w.out_of_zone.left_zone ?? "the zone"} ${ago(w.out_of_zone.since, now)}`;
  if (w.status === "in_zone" && w.zone) return w.zone.name;
  if (w.status === "offline") return `Last heard ${ago(w.device?.last_seen_at ?? null, now) ?? "never"}`;
  if (w.status === "no_device") return "Assign or connect a device";
  if (w.status === "no_consent") return "Tracking starts after consent";
  if (w.status === "waiting") return w.device?.online ? "Device online, not on site yet" : "Device connected, no signal yet";
  if (w.status === "off_site")
    return w.device?.online ? "Device online, outside the site" : `Device last heard ${ago(w.device?.last_seen_at ?? null, now) ?? "never"}`;
  return STATUS[w.status].hint;
}

// From laptop width the team is a sidebar docked beside the map, always open.
// Below that there is no room for a column next to the app's own navigation,
// so it is a bottom sheet that can be pulled up or down.
const WIDE = "(min-width: 1024px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isWide = () => window.matchMedia(WIDE).matches;

export default function RosterSheet({
  workers,
  onMapIds,
  filter,
  selectedId,
  now,
  onSelect,
  onHover,
  onClearFilter,
  hiddenOnSmall = false,
  collapsed = false,
  onCollapse,
}: Props) {
  const wide = useSyncExternalStore(subscribe, isWide, () => false);
  const [sheetOpen, setOpen] = useState(false);
  const open = wide || sheetOpen;
  const [query, setQuery] = useState("");
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);

  const counts = useMemo(() => countByStatus(workers), [workers]);

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = workers
      .filter((w) => !filter || w.status === filter)
      .filter(
        (w) =>
          !term ||
          w.full_name.toLowerCase().includes(term) ||
          (w.employee_number ?? "").toLowerCase().includes(term) ||
          w.job_category.toLowerCase().includes(term),
      )
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.full_name.localeCompare(b.full_name));
    return GROUPS.map((g) => ({ ...g, items: list.filter((w) => g.statuses.includes(w.status)) })).filter((g) => g.items.length);
  }, [workers, query, filter]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (wide) return;
    dragStart.current = e.clientY;
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    const delta = e.clientY - dragStart.current;
    dragStart.current = null;
    if (delta < -DRAG_THRESHOLD) {
      dragged.current = true;
      setOpen(true);
    } else if (delta > DRAG_THRESHOLD) {
      dragged.current = true;
      setOpen(false);
    }
  }

  const urgent = counts.out_of_zone;
  const live = workers.filter((w) => onMapIds.has(w.employee_id)).length;
  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <section
      aria-label="Employees assigned to this site"
      className={`pointer-events-auto flex flex-col overflow-hidden
        absolute inset-x-2 bottom-7 z-[600] rounded-2xl transition-[max-height] duration-300 ease-out ${GLASS} ${open ? "max-h-[70%]" : "max-h-[78px]"}
        ${hiddenOnSmall ? "max-lg:hidden" : ""}
        lg:static lg:z-auto lg:h-full lg:max-h-none lg:shrink-0 lg:rounded-none lg:border-0 lg:border-black/10 lg:bg-card lg:supports-[backdrop-filter]:bg-card lg:shadow-none lg:ring-0 lg:backdrop-blur-none lg:transition-[width] lg:duration-200
        ${collapsed ? "lg:w-0" : "lg:w-[300px] lg:border-r xl:w-[340px]"}`}
      // Folded away: nothing inside can be reached with Tab or a screen reader.
      inert={wide && collapsed}
    >
      {/* Fixed width inside, so the list slides out instead of squeezing while the sidebar folds. */}
      <div className="flex min-h-0 flex-1 flex-col lg:w-[300px] xl:w-[340px]">
      {/* The header pulls the sheet up and down on small screens; on wide screens it is just a title. */}
      <div
        {...(wide
          ? {}
          : {
              role: "button",
              tabIndex: 0,
              "aria-expanded": open,
              onPointerDown,
              onPointerUp,
              onClick: () => {
                if (!dragged.current) setOpen((v) => !v);
                dragged.current = false;
              },
              onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              },
            })}
        className={`shrink-0 px-4 pt-2 pb-3 lg:pt-4 ${wide ? "" : "cursor-pointer touch-none select-none"}`}
      >
        <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-steel lg:hidden" />
        <div className="flex items-center gap-3">
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Users className="size-4.5" />
            {urgent > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-card">
                {urgent}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Team <span className="font-normal text-muted-foreground">· {workers.length} assigned</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {workers.length ? (
                <>
                  <span className="font-medium text-ok">{live} live on map</span>
                  {urgent > 0 && <span className="font-medium text-danger"> · {urgent} need attention</span>}
                </>
              ) : (
                "No employees assigned yet"
              )}
            </p>
          </div>
          {!wide && (open ? <ChevronDown className="size-5 shrink-0 text-muted-foreground" /> : <ChevronUp className="size-5 shrink-0 text-muted-foreground" />)}
          {wide && onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Hide team list"
              title="Hide team list"
              className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <PanelLeftClose className="size-4.5" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="flex min-h-0 flex-1 flex-col border-t border-black/5">
          <div className="flex flex-col gap-2 px-3 pt-3">
            <label className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, number or job"
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            {filter && (
              <div
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ color: STATUS[filter].color, background: STATUS[filter].bg }}
              >
                <span className="truncate">
                  Showing {STATUS[filter].label.toLowerCase()} only
                  {filter === "offline" ? " · not drawn on the map" : ""}
                </span>
                <button type="button" onClick={onClearFilter} className="shrink-0 font-semibold underline-offset-2 hover:underline">
                  Show all
                </button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-3">
            {groups.map((g) => (
              <div key={g.id} className="mt-2">
                <p className="sticky top-0 z-10 flex items-center justify-between bg-card/95 px-2 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase backdrop-blur">
                  {g.label}
                  <span className="tabular-nums tracking-normal">{g.items.length}</span>
                </p>
                <ul>
                  {g.items.map((w) => {
                    const s = STATUS[w.status];
                    const onMap = onMapIds.has(w.employee_id);
                    const lowBattery = w.battery_percent !== null && w.battery_percent <= 20;
                    return (
                      <li key={w.employee_id}>
                        <button
                          type="button"
                          onClick={() => onSelect(w)}
                          onMouseEnter={() => onHover(onMap ? w.employee_id : null)}
                          onMouseLeave={() => onHover(null)}
                          className={`group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-secondary ${
                            selectedId === w.employee_id ? "bg-secondary ring-1 ring-black/5" : ""
                          }`}
                        >
                          <span className="relative shrink-0">
                            <span
                              className={`flex size-9 items-center justify-center rounded-full text-[11px] font-bold text-white ${onMap ? "" : "opacity-45 grayscale-[30%]"}`}
                              style={{ background: s.color }}
                            >
                              {initials(w.full_name)}
                            </span>
                            {onMap && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-ok ring-2 ring-card" aria-label="Live on the map" />}
                            {w.status === "offline" && (
                              <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-warn text-white ring-2 ring-card">
                                <WifiOff className="size-2.5" />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{w.full_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{detail(w, now)}</span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: s.color, background: s.bg }}>
                              {s.label}
                            </span>
                            {lowBattery && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-danger">
                                <BatteryLow className="size-3" />
                                {w.battery_percent}%
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {shown === 0 && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                {workers.length ? "No one matches." : "Assign employees to this site from the Team page."}
              </p>
            )}
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
