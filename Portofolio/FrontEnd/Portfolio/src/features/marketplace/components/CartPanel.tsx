import { ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { formatSar } from "@/shared/lib/money";
import { cartTotals } from "../types";
import type { CartLine } from "../types";

type Props = {
  lines: CartLine[];
  vatPercent: number;
  onQuantity: (productId: string, quantity: number) => void;
  onCheckout: () => void;
};

export default function CartPanel({ lines, vatPercent, onQuantity, onCheckout }: Props) {
  const totals = cartTotals(lines, vatPercent);

  return (
    <aside className="rounded-xl border bg-card p-5 lg:sticky lg:top-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <ShoppingCart className="size-4" />
        Cart
        {totals.count > 0 && <span className="text-sm font-normal text-muted-foreground">· {totals.count} devices</span>}
      </h2>

      {lines.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Add devices to your cart. They are linked to your company as soon as you order, and are ready to use when they arrive.
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y">
            {lines.map((l) => (
              <li key={l.product.id} className="flex items-center gap-3 py-3">
                <DeviceIcon type={l.product.device_type} className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.product.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {formatSar(l.product.price_halalas)} each
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={Math.min(500, l.product.stock)}
                  value={l.quantity}
                  aria-label={`Quantity of ${l.product.name}`}
                  onChange={(e) => onQuantity(l.product.id, Math.max(1, Math.min(l.product.stock, 500, Number(e.target.value) || 1)))}
                  className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-right text-sm tabular-nums"
                />
                <button
                  type="button"
                  aria-label={`Remove ${l.product.name}`}
                  onClick={() => onQuantity(l.product.id, 0)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>

          <dl className="mt-2 space-y-1.5 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatSar(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT {vatPercent}%</dt>
              <dd className="tabular-nums">{formatSar(totals.vat)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatSar(totals.total)}</dd>
            </div>
          </dl>

          <Button className="mt-5 h-10 w-full" onClick={onCheckout}>
            Checkout
          </Button>
        </>
      )}
    </aside>
  );
}
