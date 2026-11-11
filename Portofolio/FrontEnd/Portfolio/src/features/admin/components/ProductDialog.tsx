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
import { DEVICE_TYPES, DEVICE_TYPE_LABEL } from "@/shared/lib/deviceTypes";
import type { DeviceType } from "@/shared/lib/deviceTypes";
import { toHalalas } from "@/shared/lib/money";
import { createProduct, updateProduct } from "../api";
import type { AdminProduct, ProductInput } from "../types";

type Props = {
  product: AdminProduct | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export default function ProductDialog({ product, open, onClose, onSaved }: Props) {
  const editing = Boolean(product);
  const [sku, setSku] = useState(product?.sku ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [deviceType, setDeviceType] = useState<DeviceType>(product?.device_type ?? "watch");
  const [manufacturer, setManufacturer] = useState(product?.manufacturer ?? "");
  const [model, setModel] = useState(product?.model ?? "");
  const [prefix, setPrefix] = useState(product?.serial_prefix ?? "");
  const [price, setPrice] = useState(product ? (product.price_halalas / 100).toFixed(2) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "0");
  const [features, setFeatures] = useState((product?.features ?? []).join("\n"));
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const [active, setActive] = useState(product?.is_active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: ProductInput = {
      name: name.trim(),
      description: description.trim(),
      device_type: deviceType,
      manufacturer: manufacturer.trim() || null,
      model: model.trim() || null,
      serial_prefix: prefix.trim().toUpperCase(),
      price_halalas: toHalalas(price),
      stock: Number(stock),
      features: features.split("\n").map((f) => f.trim()).filter(Boolean),
      image_url: imageUrl.trim() || null,
      is_active: active,
    };
    const local: Record<string, string> = {};
    if (!Number.isFinite(body.price_halalas) || body.price_halalas <= 0) local.price_halalas = "Enter a price above zero";
    if (!Number.isInteger(body.stock) || body.stock < 0) local.stock = "Enter a whole number";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      if (product) await updateProduct(product.id, body);
      else await createProduct({ ...body, sku: sku.trim().toUpperCase() });
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors({ ...err.fields, form: Object.keys(err.fields).length ? "" : err.message });
      else setErrors({ form: "Could not save. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${product?.name}` : "New product"}</DialogTitle>
          <DialogDescription>Shown to every company in the marketplace while it is active and in stock.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate>
          {errors.form && <p className="mb-4 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{errors.form}</p>}

          <div className="grid gap-x-4 sm:grid-cols-2">
            <FormField id="p_sku" label="SKU" value={sku} disabled={editing} error={errors.sku} hint={editing ? "Cannot be changed" : undefined} onChange={(e) => setSku(e.target.value)} />
            <FormField id="p_name" label="Name" value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
            <div className="mb-5 grid gap-2">
              <Label htmlFor="p_type">Device type</Label>
              <select id="p_type" value={deviceType} onChange={(e) => setDeviceType(e.target.value as DeviceType)} className={selectClass}>
                {DEVICE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DEVICE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <FormField
              id="p_prefix"
              label="Serial prefix"
              value={prefix}
              maxLength={8}
              error={errors.serial_prefix}
              hint="Serials become PREFIX-XXXXXXXX"
              onChange={(e) => setPrefix(e.target.value)}
            />
            <FormField id="p_manufacturer" label="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            <FormField id="p_model" label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
            <FormField id="p_price" label="Price (SAR, excl. VAT)" type="number" min="0" step="0.01" value={price} error={errors.price_halalas} onChange={(e) => setPrice(e.target.value)} />
            <FormField id="p_stock" label="Stock" type="number" min="0" step="1" value={stock} error={errors.stock} onChange={(e) => setStock(e.target.value)} />
          </div>

          <div className="mb-5 grid gap-2">
            <Label htmlFor="p_description">Description</Label>
            <textarea id="p_description" rows={3} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} className="rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            {errors.description && <p className="text-sm font-medium text-destructive">{errors.description}</p>}
          </div>

          <div className="mb-5 grid gap-2">
            <Label htmlFor="p_features">Features, one per line</Label>
            <textarea id="p_features" rows={4} value={features} onChange={(e) => setFeatures(e.target.value)} className="rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            {errors.features && <p className="text-sm font-medium text-destructive">{errors.features}</p>}
          </div>

          <FormField id="p_image" label="Image URL (optional)" type="url" value={imageUrl} error={errors.image_url} onChange={(e) => setImageUrl(e.target.value)} />

          <label className="mb-6 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-primary" />
            Listed in the marketplace
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : editing ? "Save changes" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
