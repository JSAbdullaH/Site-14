import { useCallback, useEffect, useState } from "react";
import { ChevronDown, PackageCheck, Truck, XCircle } from "lucide-react";
import EmptyState from "@/shared/components/EmptyState";
import StatusBadge from "@/shared/components/StatusBadge";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatSar } from "@/shared/lib/money";
import AdminShell from "./components/AdminShell";
import ShipKeysDialog from "./components/ShipKeysDialog";
import { cancelOrder, deliverOrder, listAdminOrders, shipOrder } from "./api";
import { ORDER_STATUS } from "./types";
import type { AdminOrder, OrderStatus, ShippedKey } from "./types";

const FILTERS: { value: OrderStatus | undefined; label: string }[] = [
  { value: "placed", label: "To ship" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: undefined, label: "All" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<OrderStatus | undefined>("placed");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [shipped, setShipped] = useState<{ reference: string; keys: ShippedKey[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listAdminOrders({ status, search: search.trim() || undefined });
      setOrders(res.data);
      setTotal(res.total);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }, [status, search]);

  useEffect(() => {
    const t = window.setTimeout(load, search ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [load, search]);

  async function act(order: AdminOrder, action: "ship" | "deliver" | "cancel") {
    const prompts = {
      ship: `Mark ${order.reference_number} as shipped? New keys are made for its ${order.device_count} devices and shown once.`,
      deliver: `Confirm ${order.company.name} received ${order.reference_number}?`,
      cancel: `Cancel ${order.reference_number}? Its devices are removed from ${order.company.name} and the stock is returned.`,
    };
    if (!window.confirm(prompts[action])) return;
    setBusy(order.id);
    setError("");
    try {
      if (action === "ship") {
        const res = await shipOrder(order.id);
        setShipped({ reference: order.reference_number, keys: res.keys });
      } else if (action === "deliver") await deliverOrder(order.id);
      else await cancelOrder(order.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AdminShell title="Orders" subtitle={`${total} order${total === 1 ? "" : "s"}${status ? ` · ${FILTERS.find((f) => f.value === status)?.label.toLowerCase()}` : ""}`}>
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Order status">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              aria-pressed={status === f.value}
              onClick={() => {
                setOrders(null);
                setStatus(f.value);
              }}
              className={`rounded px-3 py-1.5 text-sm font-medium ${status === f.value ? "bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Input placeholder="Search reference or company" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
      </div>

      {orders === null ? (
        <Skeleton className="h-48 w-full" />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders here" description={status === "placed" ? "Every order has been shipped." : undefined} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const expanded = open === o.id;
            const badge = ORDER_STATUS[o.status];
            return (
              <li key={o.id} className="rounded-xl border bg-card">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : o.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{o.company.name}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {o.reference_number} · {new Date(o.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </span>
                  </button>
                  <span className="text-sm text-muted-foreground">{o.device_count} devices</span>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                  <span className="w-28 text-right font-semibold tabular-nums">{formatSar(o.total_halalas)}</span>
                  <div className="flex gap-2">
                    {o.status === "placed" && (
                      <>
                        <Button size="sm" onClick={() => act(o, "ship")} disabled={busy === o.id}>
                          <Truck />
                          Ship
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => act(o, "cancel")} disabled={busy === o.id} aria-label={`Cancel ${o.reference_number}`}>
                          <XCircle />
                        </Button>
                      </>
                    )}
                    {o.status === "shipped" && (
                      <Button size="sm" variant="outline" onClick={() => act(o, "deliver")} disabled={busy === o.id}>
                        <PackageCheck />
                        Delivered
                      </Button>
                    )}
                  </div>
                </div>

                {expanded && (
                  <div className="grid gap-5 border-t px-5 py-4 text-sm lg:grid-cols-[1fr_300px]">
                    <div className="space-y-3">
                      {o.items.map((item) => (
                        <div key={item.id}>
                          <p className="flex items-center gap-2 font-medium">
                            <DeviceIcon type={item.device_type} className="size-4 text-muted-foreground" />
                            {item.quantity} × {item.product_name}
                            <span className="font-mono text-xs font-normal text-muted-foreground">{item.sku}</span>
                            <span className="ml-auto font-normal tabular-nums">{formatSar(item.line_total_halalas)}</span>
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.devices.map((d) => (
                              <span key={d.id} className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${d.connected ? "border-ok/40 text-ok" : "text-muted-foreground"}`}>
                                {d.serial_number}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <dl className="space-y-2">
                      <div>
                        <dt className="text-xs text-muted-foreground">Ship to</dt>
                        <dd className="whitespace-pre-line">{o.shipping_address}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Contact</dt>
                        <dd>
                          {o.placed_by?.full_name} · {o.contact_phone}
                          <span className="block text-xs text-muted-foreground">{o.placed_by?.email}</span>
                        </dd>
                      </div>
                      {o.notes && (
                        <div>
                          <dt className="text-xs text-muted-foreground">Notes</dt>
                          <dd>{o.notes}</dd>
                        </div>
                      )}
                      <div>
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
      )}

      <ShipKeysDialog reference={shipped?.reference ?? null} keys={shipped?.keys ?? []} onClose={() => setShipped(null)} />
    </AdminShell>
  );
}
