import type { LiveWorker } from "../../lib/mapApi";
import { STATUS } from "./status";

type Props = { worker: LiveWorker; onClose: () => void };

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
    ["Zone", worker.zone ? `${worker.zone.name}${worker.zone.is_outdoor ? " (outdoor)" : ""}` : "—"],
    ["Battery", worker.battery_percent === null ? "—" : `${worker.battery_percent}%`],
    ["Heart rate", worker.heart_rate_bpm === null ? "—" : `${worker.heart_rate_bpm} bpm`],
    ["Last reading", ago(worker.recorded_at)],
  ];
  return (
    <aside className="absolute z-10 bg-page shadow-lg rounded-card p-5 inset-x-3 bottom-3 md:inset-x-auto md:right-4 md:top-4 md:bottom-auto md:w-72">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">{worker.full_name}</p>
          <span
            className="inline-block mt-1 px-2 py-0.5 rounded-full text-[12px] font-bold"
            style={{ color: status.color, background: status.bg }}
          >
            {status.label}
          </span>
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink font-bold" aria-label="Close">
          ✕
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-mute2 font-semibold">{k}</dt>
            <dd className="font-bold text-right truncate">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
