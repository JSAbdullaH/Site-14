import EmptyState from "@/shared/components/EmptyState";
import type { HistoryEvent, MovementHistory } from "../types";
import { clock, formatMinutes } from "../format";

type Props = { history: MovementHistory };

function describe(e: HistoryEvent) {
  switch (e.type) {
    case "arrived":
      return `Arrived at ${e.site}`;
    case "entered_zone":
      return `Entered ${e.zone?.name}`;
    case "left_zone":
      return `Left ${e.zone?.name}`;
    case "offline":
      return `Device stopped reporting${e.minutes ? ` for ${formatMinutes(e.minutes)}` : ""}`;
    case "back_online":
      return "Device reporting again";
    case "left_site":
      return `Left ${e.site}`;
  }
}

const DOT: Record<HistoryEvent["type"], string> = {
  arrived: "bg-ok",
  entered_zone: "bg-signal",
  left_zone: "bg-steel",
  offline: "bg-warn",
  back_online: "bg-ok",
  left_site: "bg-ink",
};

export default function MovementTimeline({ history }: Props) {
  if (history.sessions.length === 0) {
    return (
      <EmptyState
        title="No movements on this day"
        description="The device sent no positions for this worker on the chosen day."
      />
    );
  }

  return (
    <div className="space-y-5">
      {history.sessions.map((s) => (
        <section key={s.session_id} className="rounded-lg border bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 text-sm">
            <span className="font-semibold">{s.site.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {clock(s.started_at)} to {s.ended_at ? clock(s.ended_at) : "now"} · {s.points.length} positions
            </span>
          </div>
          <ol className="px-5 py-4">
            {s.events.map((e, i) => {
              const offline = e.type === "offline";
              const last = i === s.events.length - 1;
              return (
                <li key={`${e.type}-${e.at}-${i}`} className="relative flex gap-4 pb-4 last:pb-0">
                  {!last && (
                    <span
                      className={`absolute left-[3.85rem] top-4 bottom-0 w-px ${offline ? "border-l border-dashed border-warn" : "bg-border"}`}
                    />
                  )}
                  <span className="w-12 shrink-0 pt-0.5 text-right text-sm tabular-nums text-muted-foreground">
                    {clock(e.at)}
                  </span>
                  <span className={`relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[e.type]}`} />
                  <span
                    className={`text-sm ${offline ? "rounded-md bg-warn-bg px-2 py-0.5 font-medium text-warn" : e.type === "entered_zone" ? "font-medium" : ""}`}
                  >
                    {describe(e)}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
