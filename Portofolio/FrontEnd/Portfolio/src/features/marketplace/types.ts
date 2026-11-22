import type { DeviceType } from "@/shared/lib/deviceTypes";

export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  device_type: DeviceType;
  manufacturer: string | null;
  model: string | null;
  price_halalas: number;
  in_stock: boolean;
  stock: number;
  features: string[];
  image_url: string | null;
};

export type ListProductsResponse = { data: Product[]; vat_percent: number };

export type OrderStatus = "placed" | "shipped" | "delivered" | "cancelled";

export type OrderItem = {
  id: string;
  product_id: string;
  product_name: string;
  device_type: DeviceType;
  sku: string;
  quantity: number;
  unit_price_halalas: number;
  line_total_halalas: number;
  devices: { id: string; serial_number: string; assigned: boolean; connected: boolean }[];
};

export type Order = {
  id: string;
  reference_number: string;
  status: OrderStatus;
  company: { id: string; name: string };
  placed_by: { id: string; full_name: string; email: string } | null;
  subtotal_halalas: number;
  vat_halalas: number;
  total_halalas: number;
  shipping_address: string;
  contact_phone: string;
  notes: string | null;
  device_count: number;
  items: OrderItem[];
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type ListOrdersResponse = { data: Order[]; page: number; limit: number; total: number };

export type CartLine = { product: Product; quantity: number };

export type PlaceOrderInput = {
  items: { product_id: string; quantity: number }[];
  shipping_address: string;
  contact_phone: string;
  notes?: string;
};

export const ORDER_STATUS = {
  placed: { tone: "warn", label: "Preparing" },
  shipped: { tone: "info", label: "Shipped" },
  delivered: { tone: "ok", label: "Delivered" },
  cancelled: { tone: "neutral", label: "Cancelled" },
} as const;

export function cartTotals(lines: CartLine[], vatPercent: number) {
  const subtotal = lines.reduce((sum, l) => sum + l.product.price_halalas * l.quantity, 0);
  const vat = Math.round((subtotal * vatPercent) / 100);
  return { subtotal, vat, total: subtotal + vat, count: lines.reduce((n, l) => n + l.quantity, 0) };
}
