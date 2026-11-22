import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { isAdmin } from "@/shared/lib/auth";
import { DEVICE_TYPE_LABEL } from "@/shared/lib/deviceTypes";
import type { DeviceType } from "@/shared/lib/deviceTypes";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductCard from "./components/ProductCard";
import CartPanel from "./components/CartPanel";
import CheckoutDialog from "./components/CheckoutDialog";
import OrdersList from "./components/OrdersList";
import { listOrders, listProducts } from "./api";
import type { CartLine, Order, Product } from "./types";

export default function MarketplacePage() {
  const admin = isAdmin();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [vatPercent, setVatPercent] = useState(15);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [type, setType] = useState<DeviceType | "all">("all");
  const [tab, setTab] = useState("shop");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [error, setError] = useState("");

  const loadProducts = useCallback(async () => {
    try {
      const res = await listProducts();
      setProducts(res.data);
      setVatPercent(res.vat_percent);
    } catch (err) {
      setProducts([]);
      setError((err as Error).message);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    if (!admin) return;
    try {
      setOrders((await listOrders()).data);
    } catch (err) {
      setOrders([]);
      setError((err as Error).message);
    }
  }, [admin]);

  useEffect(() => {
    loadProducts();
    loadOrders();
  }, [loadProducts, loadOrders]);

  const lines: CartLine[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => ({ product: products?.find((p) => p.id === id), quantity }))
        .filter((l): l is CartLine => Boolean(l.product) && l.quantity > 0),
    [cart, products],
  );

  const types = useMemo(() => [...new Set((products ?? []).map((p) => p.device_type))], [products]);
  const shown = (products ?? []).filter((p) => type === "all" || p.device_type === type);

  const setQuantity = (id: string, quantity: number) =>
    setCart((c) => {
      const next = { ...c };
      if (quantity <= 0) delete next[id];
      else next[id] = quantity;
      return next;
    });

  return (
    <AppShell title="Marketplace" subtitle="Ready-to-use tracking devices, linked to your company the moment you order">
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      {placed && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-ok/30 bg-ok-bg px-5 py-4 text-sm text-ok">
          <CheckCircle2 className="size-5" />
          <p className="flex-1">
            Order <span className="font-mono font-medium">{placed.reference_number}</span> placed. {placed.device_count} device
            {placed.device_count === 1 ? " is" : "s are"} now in your inventory, and will connect on their own when switched on.
          </p>
          <Link to="/devices" className="font-medium underline-offset-2 hover:underline">
            View devices
          </Link>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="mb-6">
          <TabsTrigger value="shop">Shop</TabsTrigger>
          {admin && <TabsTrigger value="orders">My orders{orders?.length ? ` (${orders.length})` : ""}</TabsTrigger>}
        </TabsList>

        <TabsContent value="shop">
          {!admin && (
            <p className="mb-5 rounded-md bg-info-bg px-4 py-3 text-sm text-info">Only a company admin can place orders.</p>
          )}

          {types.length > 1 && (
            <div className="mb-5 inline-flex flex-wrap rounded-md border p-0.5" role="group" aria-label="Filter by type">
              {(["all", ...types] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                    type === t ? "bg-secondary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t !== "all" && <DeviceIcon type={t} className="size-3.5" />}
                  {t === "all" ? "All devices" : DEVICE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}

          <div className={`grid gap-6 ${admin ? "lg:grid-cols-[1fr_320px]" : ""}`}>
            {products === null ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-96 w-full rounded-xl" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState title="No devices available" description="New devices are added regularly. Check back soon." />
            ) : (
              <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    canBuy={admin}
                    inCart={cart[p.id] ?? 0}
                    onAdd={() => setQuantity(p.id, Math.min(p.stock, (cart[p.id] ?? 0) + 1))}
                    onRemove={() => setQuantity(p.id, (cart[p.id] ?? 0) - 1)}
                  />
                ))}
              </div>
            )}

            {admin && (
              <CartPanel lines={lines} vatPercent={vatPercent} onQuantity={setQuantity} onCheckout={() => setCheckoutOpen(true)} />
            )}
          </div>
        </TabsContent>

        {admin && (
          <TabsContent value="orders">
            {orders === null ? (
              <Skeleton className="h-40 w-full" />
            ) : orders.length === 0 ? (
              <EmptyState title="No orders yet" description="Devices you buy appear here, with their delivery status." />
            ) : (
              <OrdersList key={orders[0]?.id} orders={orders} />
            )}
          </TabsContent>
        )}
      </Tabs>

      <CheckoutDialog
        open={checkoutOpen}
        lines={lines}
        vatPercent={vatPercent}
        onOpenChange={setCheckoutOpen}
        onPlaced={(order) => {
          setCheckoutOpen(false);
          setCart({});
          setPlaced(order);
          setTab("orders");
          loadOrders();
          loadProducts();
        }}
      />
    </AppShell>
  );
}
