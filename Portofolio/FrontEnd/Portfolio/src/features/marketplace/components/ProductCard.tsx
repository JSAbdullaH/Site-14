import { Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { DEVICE_TYPE_LABEL } from "@/shared/lib/deviceTypes";
import { formatSar } from "@/shared/lib/money";
import type { Product } from "../types";

type Props = {
  product: Product;
  inCart: number;
  canBuy: boolean;
  onAdd: () => void;
  onRemove: () => void;
};

export default function ProductCard({ product, inCart, canBuy, onAdd, onRemove }: Props) {
  const soldOut = !product.in_stock;
  const atLimit = inCart >= product.stock;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="relative flex aspect-[4/3] items-center justify-center bg-sand">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <DeviceIcon type={product.device_type} className="size-20 text-steel" strokeWidth={1.25} />
        )}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium">
          <DeviceIcon type={product.device_type} className="size-3.5" />
          {DEVICE_TYPE_LABEL[product.device_type]}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold">{product.name}</h3>
        <p className="text-xs text-muted-foreground">
          {[product.manufacturer, product.model].filter(Boolean).join(" ")}
        </p>
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{product.description}</p>

        {product.features.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {product.features.slice(0, 4).map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
                {f}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="text-lg font-semibold tabular-nums">{formatSar(product.price_halalas)}</p>
            <p className={`text-xs ${soldOut ? "text-danger" : product.stock <= 10 ? "text-warn" : "text-muted-foreground"}`}>
              {soldOut ? "Out of stock" : product.stock <= 10 ? `Only ${product.stock} left` : "In stock · excl. VAT"}
            </p>
          </div>

          {canBuy &&
            (inCart > 0 ? (
              <div className="inline-flex items-center rounded-lg border">
                <Button size="icon" variant="ghost" aria-label={`Remove one ${product.name}`} onClick={onRemove}>
                  <Minus />
                </Button>
                <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
                  {inCart}
                </span>
                <Button size="icon" variant="ghost" aria-label={`Add one ${product.name}`} onClick={onAdd} disabled={atLimit}>
                  <Plus />
                </Button>
              </div>
            ) : (
              <Button onClick={onAdd} disabled={soldOut}>
                Add to cart
              </Button>
            ))}
        </div>
      </div>
    </article>
  );
}
