import { useState } from "react";
import type { FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import FormField from "@/shared/components/FormField";
import { ApiError } from "@/shared/lib/api";
import { formatSar } from "@/shared/lib/money";
import { placeOrder } from "../api";
import { cartTotals } from "../types";
import type { CartLine, Order } from "../types";

type Props = {
  open: boolean;
  lines: CartLine[];
  vatPercent: number;
  onOpenChange: (open: boolean) => void;
  onPlaced: (order: Order) => void;
};

type Errors = Partial<Record<"shipping_address" | "contact_phone" | "form", string>>;

export default function CheckoutDialog({ open, lines, vatPercent, onOpenChange, onPlaced }: Props) {
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const totals = cartTotals(lines, vatPercent);

  function check(): Errors {
    const next: Errors = {};
    if (address.trim().length < 10) next.shipping_address = "Enter the full delivery address";
    if (!/^\+?[0-9 ()-]{7,30}$/.test(phone.trim())) next.contact_phone = "Enter a valid phone number";
    return next;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const order = await placeOrder({
        items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        shipping_address: address.trim(),
        contact_phone: phone.trim(),
        notes: notes.trim() || undefined,
      });
      setAddress("");
      setPhone("");
      setNotes("");
      onPlaced(order);
    } catch (err) {
      if (err instanceof ApiError) {
        const stock = Object.entries(err.fields).find(([k]) => k.startsWith("items."));
        setErrors({
          shipping_address: err.fields.shipping_address,
          contact_phone: err.fields.contact_phone,
          form: stock ? `${lines[Number(stock[0].split(".")[1])]?.product.name ?? "A product"}: ${stock[1]}` : err.message,
        });
      } else {
        setErrors({ form: "Could not place the order. Try again." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Place order</DialogTitle>
          <DialogDescription>
            {totals.count} device{totals.count === 1 ? "" : "s"} for {formatSar(totals.total)} including VAT. They appear in
            your device inventory right away, and connect on their own when you switch them on.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {errors.form && (
            <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{errors.form}</p>
          )}

          <div className="mb-5 grid gap-2">
            <Label htmlFor="shipping_address">Delivery address</Label>
            <textarea
              id="shipping_address"
              rows={3}
              value={address}
              maxLength={500}
              aria-invalid={Boolean(errors.shipping_address)}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Building, street, district, city, postal code"
              className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
            />
            {errors.shipping_address && <p className="text-sm font-medium text-destructive">{errors.shipping_address}</p>}
          </div>

          <FormField
            id="contact_phone"
            label="Contact phone"
            type="tel"
            autoComplete="tel"
            placeholder="+966 5X XXX XXXX"
            value={phone}
            error={errors.contact_phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <FormField
            id="order_notes"
            label="Notes (optional)"
            value={notes}
            maxLength={500}
            placeholder="Delivery hours, gate number..."
            onChange={(e) => setNotes(e.target.value)}
          />

          <p className="mb-5 text-xs text-muted-foreground">
            An invoice is sent to your company. Payment is due on delivery.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Back to cart
            </Button>
            <Button type="submit" disabled={busy || lines.length === 0}>
              {busy ? "Placing order..." : `Place order · ${formatSar(totals.total)}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
