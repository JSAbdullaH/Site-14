import { describeEvent, EVENT_TONE } from "@/shared/lib/presence";
import type { PresenceEvent } from "@/shared/lib/presence";
import StatusBadge from "@/shared/components/StatusBadge";

const TYPE_LABEL = {
  zone_exit: "Out of zone",
  zone_enter: "Entered zone",
  site_enter: "Arrived",
  site_exit: "Left site",
  device_offline: "Offline",
  device_online: "Back online",
} as const;

export default function ActivityLog({ events }: { events: PresenceEvent[] }) {
  const days = new Map<string, PresenceEvent[]>();
  for (const e of events) {
    const day = new Date(e.occurred_at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    days.set(day, [...(days.get(day) ?? []), e]);
  }

  return (
    <div className="space-y-6">
      {[...days].map(([day, list]) => (
        <section key={day}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{day}</h3>
          <ol className="divide-y rounded-xl border bg-card">
            {list.map((e) => {
              const { title, detail } = describeEvent(e);
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <time className="w-14 shrink-0 text-muted-foreground tabular-nums" dateTime={e.occurred_at}>
                    {new Date(e.occurred_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{title}</p>
                    <p className="truncate text-xs text-muted-foreground">{detail}</p>
                  </div>
                  <StatusBadge tone={EVENT_TONE[e.type]}>{TYPE_LABEL[e.type]}</StatusBadge>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
