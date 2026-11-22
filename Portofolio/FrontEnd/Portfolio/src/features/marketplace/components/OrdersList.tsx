import { useState } from "react";
import { ChevronDown, PackageCheck, Truck, Package } from "lucide-react";
import StatusBadge from "@/shared/components/StatusBadge";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { formatSar } from "@/shared/lib/money";
import { ORDER_STATUS } from "../types";
import type { Order } from "../types";

const STEPS = [
  { key: "placed", label: "Ordered", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: PackageCheck },
] as const;

function Progress({ order }: { order: Order }) {
  if (order.status === "cancelled") return <p className="text-sm text-muted-foreground">This order was cancelled. Its devices were removed.</p>;
  const reached = STEPS.findIndex((s) => s.key === order.status);
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
              i <= reached ? "bg-ok-bg text-ok" : "bg-secondary text-muted-foreground"
            }`}
          >
            <s.icon className="size-3.5" />
            {s.label}
          </span>
          {i < STEPS.length - 1 && <span className={`h-px w-6 ${i < reached ? "bg-ok" : "bg-border"}`} />}
        </li>
      ))}
    </ol>
  );
}

export default function OrdersList({ orders }: { orders: Order[] }) {
  const [open, setOpen] = useState<string | null>(orders[0]?.id ?? null);

  return (
    <ul className="space-y-3">
      {orders.map((o) => {
        const status = ORDER_STATUS[o.status];
        const expanded = open === o.id;
        return (
          <li key={o.id} className="rounded-xl border bg-card">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : o.id)}
              className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-medium">{o.reference_number}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })} · {o.device_count} device
                  {o.device_count === 1 ? "" : "s"}
                </p>
              </div>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <span className="w-28 text-right font-semibold tabular-nums">{formatSar(o.total_halalas)}</span>
              <ChevronDown className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>

            {expanded && (
              <div className="space-y-4 border-t px-5 py-4">
                <Progress order={o} />
                {o.items.map((item) => (
                  <div key={item.id}>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <DeviceIcon type={item.device_type} className="size-4 text-muted-foreground" />
                      {item.quantity} × {item.product_name}
                      <span className="ml-auto font-normal tabular-nums text-muted-foreground">
                        {formatSar(item.line_total_halalas)}
                      </span>
                    </p>
                    {item.devices.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.devices.map((d) => (
                          <span
                            key={d.id}
                            title={d.connected ? "Connected" : "Not connected yet"}
                            className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${d.connected ? "border-ok/40 text-ok" : "text-muted-foreground"}`}
                          >
                            {d.serial_number}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <dl className="grid gap-1 border-t pt-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Deliver to</dt>
                    <dd className="whitespace-pre-line">{o.shipping_address}</dd>
                  </div>
                  <div className="sm:text-right">
                    <dt className="text-xs text-muted-foreground">Subtotal · VAT</dt>
                    <dd className="tabular-nums">
                      {formatSar(o.subtotal_halalas)} · {formatSar(o.vat_halalas)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
