import { Building2, Pencil, Sun, X } from "lucide-react";
import type { Geofence, LiveWorker } from "../api";
import { STATUS } from "./status";
import { GLASS, initials } from "./format";

type Props = {
  zone: Geofence;
  workers: LiveWorker[];
  onSelectWorker: (w: LiveWorker) => void;
  onEdit: () => void;
  onClose: () => void;
};

export default function ZoneCard({ zone, workers, onSelectWorker, onEdit, onClose }: Props) {
  const color = zone.is_outdoor ? "#DB4406" : "#4F7A5B";
  return (
    <aside
      aria-label={`${zone.name} zone`}
      className={`pointer-events-auto absolute inset-x-2 bottom-7 z-40 flex max-h-[55%] flex-col overflow-hidden rounded-2xl md:inset-x-auto md:bottom-auto md:right-3 md:top-16 md:w-80 ${GLASS} animate-in fade-in slide-in-from-bottom-3 duration-200 md:slide-in-from-bottom-0 md:slide-in-from-right-3`}
    >
      <div className="h-1 shrink-0" style={{ background: color }} />
      <div className="overflow-y-auto overscroll-contain p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: color }}
          >
            {zone.is_outdoor ? <Sun className="size-5" /> : <Building2 className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">{zone.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {zone.is_outdoor ? "Outdoor · midday ban applies" : "Indoor / shaded work zone"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Inside now · {workers.length}
        </p>
        {workers.length ? (
          <ul className="mt-1.5 -mx-1.5">
            {workers.map((w) => (
              <li key={w.employee_id}>
                <button
                  type="button"
                  onClick={() => onSelectWorker(w)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: STATUS[w.status].color }}
                  >
                    {initials(w.full_name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{w.full_name}</span>
                  <span className="truncate text-xs text-muted-foreground">{w.job_category}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 rounded-lg bg-secondary px-3 py-2.5 text-xs text-muted-foreground">No one is live in this zone right now.</p>
        )}

        <button
          type="button"
          onClick={onEdit}
          className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border bg-background text-[13px] font-semibold transition-colors hover:bg-secondary"
        >
          <Pencil className="size-3.5" />
          Edit zone
        </button>
      </div>
    </aside>
  );
}
