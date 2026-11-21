import { useState } from "react";
import { formatSar, formatSarShort } from "@/shared/lib/money";

type Point = { day: string; orders: number; revenue_halalas: number };

const HEIGHT = 180;
const AXIS = 56;
const GAP = 2;

function niceMax(value: number) {
  if (value <= 0) return 10_000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function RevenueChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.revenue_halalas)));
  const ticks = [0, max / 2, max];
  const active = hover !== null ? data[hover] : null;

  return (
    <figure className="relative">
      <div className="flex">
        <div className="relative shrink-0" style={{ width: AXIS, height: HEIGHT }} aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
              style={{ top: HEIGHT - (t / max) * HEIGHT }}
            >
              {formatSarShort(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1" style={{ height: HEIGHT }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border/70" style={{ top: HEIGHT - (t / max) * HEIGHT }} aria-hidden="true" />
          ))}
          <div className="absolute inset-0 flex items-end" style={{ gap: GAP }}>
            {data.map((d, i) => {
              const h = d.revenue_halalas ? Math.max(2, (d.revenue_halalas / max) * HEIGHT) : 0;
              return (
                <button
                  key={d.day}
                  type="button"
                  aria-label={`${dayLabel(d.day)}: ${formatSar(d.revenue_halalas)}, ${d.orders} orders`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="group relative flex h-full flex-1 items-end outline-none"
                >
                  <span
                    className={`block w-full rounded-t-[4px] bg-primary transition-opacity ${hover !== null && hover !== i ? "opacity-40" : ""} group-focus-visible:ring-2 group-focus-visible:ring-ring`}
                    style={{ height: h }}
                  />
                </button>
              );
            })}
          </div>

          {active && hover !== null && (
            <div
              role="status"
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
              style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
            >
              <p className="font-medium">{dayLabel(active.day)}</p>
              <p className="tabular-nums">{formatSar(active.revenue_halalas)}</p>
              <p className="text-muted-foreground tabular-nums">
                {active.orders} order{active.orders === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground" style={{ paddingLeft: AXIS }} aria-hidden="true">
        <span>{dayLabel(data[0].day)}</span>
        <span>{dayLabel(data[Math.floor(data.length / 2)].day)}</span>
        <span>Today</span>
      </div>

      <table className="sr-only">
        <caption>Revenue per day, last 14 days</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Orders</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.orders}</td>
              <td>{formatSar(d.revenue_halalas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
