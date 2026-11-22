import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import StatusBadge from "@/shared/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSar } from "@/shared/lib/money";
import AdminShell from "./components/AdminShell";
import StatTile from "./components/StatTile";
import RevenueChart from "./components/RevenueChart";
import TypeBars from "./components/TypeBars";
import { getOverview } from "./api";
import { ORDER_STATUS } from "./types";
import type { Overview } from "./types";

const REFRESH_MS = 30_000;

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      getOverview()
        .then((d) => {
          setData(d);
          setError("");
        })
        .catch((err: Error) => setError(err.message));
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <AdminShell title="Overview" subtitle="Every company, device and order on SITE14">
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Revenue, last 30 days" value={formatSar(data.orders.revenue_30d_halalas)} hint={`${formatSar(data.orders.revenue_halalas)} all time`} />
            <StatTile
              label="Orders to ship"
              value={data.orders.by_status.placed}
              hint={`${data.orders.by_status.shipped} shipped, awaiting delivery`}
            />
            <StatTile label="Companies" value={data.companies.total} hint={`${data.companies.new_30d} joined in 30 days · ${data.users.active} users`} />
            <StatTile
              label="Devices online"
              value={`${data.devices.online} / ${data.devices.active}`}
              hint={`${data.employees.active} employees tracked`}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Revenue per day</h2>
              <p className="mb-5 text-xs text-muted-foreground">Last 14 days, including VAT, cancelled orders excluded</p>
              <RevenueChart data={data.orders.daily} />
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Devices by type</h2>
              <p className="mb-5 text-xs text-muted-foreground">
                {data.devices.by_source.marketplace} bought · {data.devices.by_source.paired} connected from a browser ·{" "}
                {data.devices.by_source.registered} registered by serial
              </p>
              <TypeBars counts={data.devices.by_type} />
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <section className="rounded-xl border bg-card">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h2 className="font-semibold">Recent orders</h2>
                <Link to="/admin/orders" className="text-sm font-medium text-signal hover:underline">
                  All orders
                </Link>
              </div>
              {data.orders.recent.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <ul className="divide-y">
                  {data.orders.recent.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{o.company.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{o.reference_number}</p>
                      </div>
                      <span className="text-muted-foreground">{o.device_count} devices</span>
                      <StatusBadge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</StatusBadge>
                      <span className="w-28 text-right font-medium tabular-nums">{formatSar(o.total_halalas)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Low stock</h2>
              {data.low_stock.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Every product has more than 5 units.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.low_stock.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <AlertTriangle className={`size-4 ${p.stock === 0 ? "text-danger" : "text-warn"}`} />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="font-medium tabular-nums">{p.stock === 0 ? "Sold out" : `${p.stock} left`}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/admin/products" className="mt-4 inline-block text-sm font-medium text-signal hover:underline">
                Manage products
              </Link>
            </section>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
