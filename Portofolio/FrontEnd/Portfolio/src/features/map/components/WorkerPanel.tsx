import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BatteryFull, BatteryLow, BatteryMedium, Clock, HeartPulse, History, LocateFixed, MapPin, Smartphone, WifiOff, X } from "lucide-react";
import type { LiveWorker } from "../api";
import { STATUS } from "./status";
import { DASH, GLASS, ago, batteryTone, clock, duration, initials } from "./format";

type Props = {
  worker: LiveWorker;
  onMap: boolean;
  now: number;
  onClose: () => void;
  onCenter: () => void;
};

function Stat({ icon, label, value, tone = "" }: { icon: ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-secondary/80 px-3 py-2.5">
      <div className={`flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground`}>
        {icon}
        {label}
      </div>
      <div className={`mt-1 truncate text-[15px] font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function BatteryIcon({ pct }: { pct: number | null }) {
  const cls = `size-3.5 ${batteryTone(pct)}`;
  if (pct !== null && pct <= 30) return <BatteryLow className={cls} />;
  if (pct !== null && pct <= 70) return <BatteryMedium className={cls} />;
  return <BatteryFull className={cls} />;
}

export default function WorkerPanel({ worker, onMap, now, onClose, onCenter }: Props) {
  const status = STATUS[worker.status];
  const out = worker.out_of_zone;
  const device = worker.device;
  const hasStats = worker.battery_percent !== null || worker.heart_rate_bpm !== null || worker.recorded_at !== null;

  const deviceLabel: ReactNode = device ? (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-1.5 rounded-full ${device.online ? "bg-ok" : "bg-mute2"}`} />
      {device.name || device.serial_number}
    </span>
  ) : (
    "None assigned"
  );

  const rows: [string, ReactNode][] = [
    ["Job", worker.job_category],
    ["Zone", worker.zone ? worker.zone.name : DASH],
    [
      "Shift",
      worker.shift_started_at
        ? `Started ${clock(worker.shift_started_at)} · ${duration(now - Date.parse(worker.shift_started_at))}`
        : "Not on shift",
    ],
    ["Device", deviceLabel],
    ["Last heard", device ? (ago(device.last_seen_at, now) ?? "Never") : DASH],
  ];

  return (
    <aside
      aria-label={`${worker.full_name} details`}
      className={`pointer-events-auto absolute inset-x-2 bottom-7 z-40 flex max-h-[62%] flex-col overflow-hidden rounded-2xl md:inset-x-auto md:bottom-auto md:right-3 md:top-16 md:max-h-[calc(100%-6.5rem)] md:w-80 ${GLASS} animate-in fade-in slide-in-from-bottom-3 duration-200 md:slide-in-from-bottom-0 md:slide-in-from-right-3`}
    >
      <div className="h-1 shrink-0" style={{ background: status.color }} />
      <div className="overflow-y-auto overscroll-contain p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ring-[3px] ring-white"
            style={{ background: status.color, opacity: onMap ? 1 : 0.55 }}
          >
            {initials(worker.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">{worker.full_name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {worker.job_category}
              {worker.employee_number ? ` · #${worker.employee_number}` : ""}
            </p>
            <span
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: status.color, background: status.bg }}
            >
              <span className="size-1.5 rounded-full" style={{ background: status.color }} />
              {status.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="-mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {out && (
          <div className="mt-3 rounded-xl border border-danger/15 bg-danger-bg px-3 py-2.5 text-xs text-danger">
            <p className="font-semibold">Left {out.left_zone ?? "the work zone"}</p>
            <p className="mt-0.5 opacity-85">
              {ago(out.since, now)}
              {out.acknowledged ? " · alert acknowledged" : " · alert open"}
            </p>
          </div>
        )}

        {!onMap && worker.status === "offline" && (
          <div className="mt-3 flex gap-2.5 rounded-xl border border-warn/15 bg-warn-bg px-3 py-2.5 text-xs text-warn">
            <WifiOff className="mt-px size-4 shrink-0" />
            <p>
              <span className="font-semibold">Removed from the map.</span> The device stopped sending
              {device?.last_seen_at ? ` at ${clock(device.last_seen_at)}` : ""}. The worker comes back on the map as soon as it
              reconnects.
            </p>
          </div>
        )}

        {!out && worker.status !== "offline" && !onMap && (
          <p className="mt-3 rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">{status.hint}.</p>
        )}

        {hasStats && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat
              icon={<BatteryIcon pct={worker.battery_percent} />}
              label="Battery"
              value={worker.battery_percent === null ? DASH : `${worker.battery_percent}%`}
              tone={worker.battery_percent !== null && worker.battery_percent <= 30 ? batteryTone(worker.battery_percent) : ""}
            />
            <Stat
              icon={<HeartPulse className="size-3.5 text-danger" />}
              label="Heart"
              value={worker.heart_rate_bpm === null ? DASH : `${worker.heart_rate_bpm}`}
            />
            <Stat
              icon={<MapPin className="size-3.5" />}
              label="Position"
              value={worker.recorded_at ? (ago(worker.recorded_at, now) ?? DASH).replace(" ago", "") : DASH}
            />
          </div>
        )}

        <dl className="mt-4 divide-y text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 truncate text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCenter}
            disabled={!onMap}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <LocateFixed className="size-4" />
            Center
          </button>
          <Link
            to={`/history?employee=${worker.employee_id}`}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border bg-background text-[13px] font-semibold transition-colors hover:bg-secondary"
          >
            <History className="size-4" />
            Today's path
          </Link>
        </div>

        {device && !onMap && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            {device.online ? <Smartphone className="size-3" /> : <Clock className="size-3" />}
            {device.online ? "Device online" : `Device last heard ${ago(device.last_seen_at, now) ?? "never"}`}
          </p>
        )}
      </div>
    </aside>
  );
}
