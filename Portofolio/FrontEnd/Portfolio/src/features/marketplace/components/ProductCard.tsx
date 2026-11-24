import { Minus, Plus } from "lucide-react";
import { formatSar } from "@/shared/lib/money";
import type { Product } from "../types";
import PixelDevice, { PIXEL_COLOR } from "./PixelDevice";

type Props = {
  product: Product;
  inCart: number;
  canBuy: boolean;
  onAdd: () => void;
  onRemove: () => void;
};

const holesX =
  "pointer-events-none absolute inset-x-0 h-3.5 bg-[radial-gradient(circle,var(--background)_5px,transparent_5.6px)] bg-[length:16px_14px] bg-repeat-x";
const holesY =
  "pointer-events-none absolute inset-y-0 w-3.5 bg-[radial-gradient(circle,var(--background)_5px,transparent_5.6px)] bg-[length:14px_16px] bg-repeat-y";
const pill =
  "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DB4406] disabled:pointer-events-none disabled:opacity-40";

export default function ProductCard({ product, inCart, canBuy, onAdd, onRemove }: Props) {
  const soldOut = !product.in_stock;
  const atLimit = inCart >= product.stock;
  const stockNote = soldOut ? "Out of stock" : product.stock <= 10 ? `Only ${product.stock} left · plus VAT` : "plus VAT";

  return (
    <article className="relative flex flex-col gap-5 bg-white px-6 pt-7 pb-6 text-[#1A1A1A] transition-transform duration-300 hover:-translate-y-1">
      <div aria-hidden="true" className={`${holesX} -top-[7px]`} />
      <div aria-hidden="true" className={`${holesX} -bottom-[7px]`} />
      <div aria-hidden="true" className={`${holesY} -left-[7px]`} />
      <div aria-hidden="true" className={`${holesY} -right-[7px]`} />

      <div className="flex h-52 items-center justify-center overflow-hidden bg-[radial-gradient(#BDBAB4_1px,transparent_1.3px)] bg-[length:5px_5px]">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="max-h-40 object-contain" loading="lazy" />
        ) : (
          <PixelDevice type={product.device_type} label={product.name} />
        )}
      </div>

      <div>
        <h3 className="font-pixel text-[26px] leading-none uppercase" style={{ color: PIXEL_COLOR[product.device_type] }}>
          {product.name}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-[#4A4843]">{product.description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold tabular-nums">{formatSar(product.price_halalas)}</p>
          <p className={`text-xs ${soldOut ? "text-danger" : product.stock <= 10 ? "text-warn" : "text-[#6B6862]"}`}>{stockNote}</p>
        </div>

        {canBuy &&
          (inCart > 0 ? (
            <div className="inline-flex min-h-11 items-center rounded-full bg-[#1A1A1A] px-1 text-white">
              <button type="button" aria-label={`Remove one ${product.name}`} onClick={onRemove} className="grid size-9 place-items-center rounded-full hover:bg-white/15">
                <Minus className="size-4" />
              </button>
              <span className="w-7 text-center text-sm font-medium tabular-nums" aria-live="polite">
                {inCart}
              </span>
              <button type="button" aria-label={`Add one ${product.name}`} onClick={onAdd} disabled={atLimit} className="grid size-9 place-items-center rounded-full hover:bg-white/15 disabled:opacity-40">
                <Plus className="size-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={onAdd} disabled={soldOut} className={`${pill} bg-[#1A1A1A] text-white hover:bg-[#DB4406]`}>
              Add to cart
            </button>
          ))}
      </div>
    </article>
  );
}
