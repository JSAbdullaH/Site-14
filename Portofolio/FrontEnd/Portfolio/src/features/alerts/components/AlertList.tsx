import { CheckCircle2, HeartPulse, MapPinOff, Sun, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { durationLabel, sinceLabel } from "@/shared/lib/presence";
import { ALERT_LABEL, alertDetail } from "../types";
import type { Alert, AlertType } from "../types";

const ICON: Record<AlertType, LucideIcon> = {
  zone_exit: MapPinOff,
  hour_limit: Timer,
  midday_ban: Sun,
  heart_rate_high: HeartPulse,
  heart_rate_low: HeartPulse,
};

type Props = {
  alerts: Alert[];
  now: number;
  busy: string | null;
  onAcknowledge: (alert: Alert) => void;
};

export default function AlertList({ alerts, now, busy, onAcknowledge }: Props) {
  return (
    <ul className="space-y-3">
      {alerts.map((a) => {
        const Icon = ICON[a.type];
        const open = a.status === "open";
        const seconds = open ? Math.max(0, Math.round((now - Date.parse(a.triggered_at)) / 1000)) : a.duration_seconds;
        return (
          <li
            key={a.id}
            className={`flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4 ${
              open && !a.acknowledged_at ? "border-danger/40" : ""
            }`}
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                open ? "bg-danger-bg text-danger" : "bg-secondary text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {a.employee.full_name}
                <span className="ml-2 text-sm font-medium text-muted-foreground">{ALERT_LABEL[a.type]}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                {alertDetail(a)} · {a.site.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Since {new Date(a.triggered_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} ·{" "}
                {open ? `${durationLabel(seconds)} so far` : `lasted ${durationLabel(seconds)}, resolved ${sinceLabel(a.resolved_at!, now)}`}
              </p>
            </div>

            {a.acknowledged_by ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-ok">
                <CheckCircle2 className="size-4" />
                Seen by {a.acknowledged_by.full_name}
              </span>
            ) : open ? (
              <Button variant="outline" onClick={() => onAcknowledge(a)} disabled={busy === a.id}>
                {busy === a.id ? "Saving..." : "Acknowledge"}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
