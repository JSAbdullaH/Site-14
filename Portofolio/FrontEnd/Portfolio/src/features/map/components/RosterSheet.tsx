import { useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { ChevronUp, MapPin, Search, Smartphone } from "lucide-react";
import type { LiveWorker } from "../api";
import { EMPTY_COUNTS, STATUS, STATUS_ORDER } from "./status";

type Props = {
  workers: LiveWorker[];
  selectedId: string | null;
  onSelect: (worker: LiveWorker) => void;
};

const DRAG_THRESHOLD = 28;

function ago(iso: string | null) {
  if (!iso) return null;
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

function detail(w: LiveWorker) {
  if (w.status === "out_of_zone" && w.out_of_zone) return `Left ${w.out_of_zone.left_zone ?? "the zone"} ${ago(w.out_of_zone.since)}`;
  if (w.status === "in_zone" && w.zone) return w.zone.name;
  if (w.status === "offline") return `Last heard ${ago(w.device?.last_seen_at ?? null) ?? "never"}`;
  if (w.status === "no_device") return "Assign or connect a device";
  if (w.status === "no_consent") return "Tracking starts after consent";
  if (w.status === "waiting") return w.device?.online ? "Device online, not on site yet" : "Device connected, no signal yet";
  if (w.status === "off_site") return w.device?.online ? "Device online, outside the site" : `Device last heard ${ago(w.device?.last_seen_at ?? null) ?? "never"}`;
  return STATUS[w.status].hint;
}

export default function RosterSheet({ workers, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);

  const counts = useMemo(() => workers.reduce((acc, w) => ({ ...acc, [w.status]: acc[w.status] + 1 }), EMPTY_COUNTS), [workers]);

  const list = useMemo(() => {
    const term = query.trim().toLowerCase();
    return workers
      .filter((w) => !term || w.full_name.toLowerCase().includes(term) || (w.employee_number ?? "").toLowerCase().includes(term))
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.full_name.localeCompare(b.full_name));
  }, [workers, query]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
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

  const urgent = counts.out_of_zone + counts.offline;

  return (
    <section
      aria-label="Employees assigned to this site"
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t bg-card shadow-[0_-8px_24px_rgba(0,0,0,0.12)] transition-[max-height] duration-300 ease-out ${
        open ? "max-h-[70%]" : "max-h-[76px]"
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={() => {
          if (!dragged.current) setOpen((v) => !v);
          dragged.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="shrink-0 cursor-pointer touch-none select-none px-4 pt-2 pb-3"
      >
        <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-steel" />
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {workers.length} assigned to this site
              {urgent > 0 && <span className="ml-2 text-danger">· {urgent} need attention</span>}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {STATUS_ORDER.filter((s) => counts[s] > 0)
                .map((s) => `${counts[s]} ${STATUS[s].label.toLowerCase()}`)
                .join(" · ") || "No employees assigned yet"}
            </p>
          </div>
          <ChevronUp className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </div>

      {open && (
        <div className="flex min-h-0 flex-1 flex-col border-t">
          {workers.length > 6 && (
            <label className="mx-4 mt-3 flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or number"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
          )}
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto overscroll-contain px-2 py-1">
            {list.map((w) => {
              const s = STATUS[w.status];
              return (
                <li key={w.employee_id}>
                  <button
                    type="button"
                    onClick={() => onSelect(w)}
                    className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-secondary ${
                      selectedId === w.employee_id ? "bg-secondary" : ""
                    }`}
                  >
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{w.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{detail(w)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {w.device && (
                        <Smartphone
                          className={`size-3.5 ${w.device.online ? "text-ok" : "text-muted-foreground"}`}
                          aria-label={w.device.online ? "Device online" : "Device offline"}
                        />
                      )}
                      {w.has_position && <MapPin className="size-3.5 text-muted-foreground" aria-label="Shown on the map" />}
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: s.color, background: s.bg }}>
                        {s.label}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                {workers.length ? "No one matches." : "Assign employees to this site from the Team page."}
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
