import type { LiveWorker } from "../api";
import { STATUS } from "./status";

type Props = { worker: LiveWorker; onClose: () => void };

const DASH = "—";

function ago(iso: string | null) {
  if (!iso) return DASH;
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min ago`;
  return new Date(iso).toLocaleDateString();
}

export default function WorkerPanel({ worker, onClose }: Props) {
  const status = STATUS[worker.status];
  const out = worker.out_of_zone;
  const rows: [string, string][] = [
    ["Job", worker.job_category],
    ["Zone", worker.zone ? worker.zone.name : DASH],
    ["Shift started", worker.shift_started_at ? ago(worker.shift_started_at) : DASH],
    ["Device", worker.device ? worker.device.name || worker.device.serial_number : "None"],
    ["Device last heard", worker.device ? ago(worker.device.last_seen_at) : DASH],
    ["Battery", worker.battery_percent === null ? DASH : `${worker.battery_percent}%`],
    ["Heart rate", worker.heart_rate_bpm === null ? DASH : `${worker.heart_rate_bpm} bpm`],
    ["Last position", worker.recorded_at ? ago(worker.recorded_at) : "Not yet"],
  ];

  return (
    <aside className="absolute inset-x-3 top-3 z-30 max-h-[calc(100%-6.5rem)] overflow-y-auto rounded-xl border bg-card p-5 shadow-lg md:inset-x-auto md:right-4 md:top-4 md:w-72">
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
        <button onClick={onClose} className="text-xl leading-none text-muted-foreground hover:text-foreground" aria-label="Close">
          &times;
        </button>
      </div>

      {out && (
        <p className="mt-3 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger">
          Left {out.left_zone ?? "the work zone"} {ago(out.since)}
          {out.acknowledged ? " · acknowledged" : ""}
        </p>
      )}
      {worker.status !== "out_of_zone" && worker.status !== "in_zone" && worker.status !== "on_site" && (
        <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">{status.hint}.</p>
      )}

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
