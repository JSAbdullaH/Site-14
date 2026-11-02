import type { LiveWorker } from "../api";
import { STATUS } from "./status";

type Props = { worker: LiveWorker; onClose: () => void };

const DASH = "\u2014";

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export default function WorkerPanel({ worker, onClose }: Props) {
  const status = STATUS[worker.location_status];
  const rows: [string, string][] = [
    ["Job", worker.job_category],
    ["Zone", worker.zone ? worker.zone.name : DASH],
    ["Battery", worker.battery_percent === null ? DASH : `${worker.battery_percent}%`],
    ["Heart rate", worker.heart_rate_bpm === null ? DASH : `${worker.heart_rate_bpm} bpm`],
    ["Last reading", ago(worker.recorded_at)],
  ];

  return (
    <aside className="absolute inset-x-3 bottom-3 z-10 rounded-xl border bg-card p-5 shadow-lg md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:w-72">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{worker.full_name}</p>
          <span
            className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ color: status.color, background: status.bg }}
          >
            {status.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="truncate text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
