import type { DeviceHealth, DeviceSource, DeviceType } from "@/shared/lib/deviceTypes";

export type Paged<T> = { data: T[]; page: number; limit: number; total: number };

export type OrderStatus = "placed" | "shipped" | "delivered" | "cancelled";

export type AdminProduct = {
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
  serial_prefix: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductInput = {
  sku?: string;
  name: string;
  description: string;
  device_type: DeviceType;
  manufacturer: string | null;
  model: string | null;
  serial_prefix: string;
  price_halalas: number;
  stock: number;
  features: string[];
  image_url: string | null;
  is_active: boolean;
};

export type AdminOrder = {
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
  items: {
    id: string;
    product_name: string;
    device_type: DeviceType;
    sku: string;
    quantity: number;
    unit_price_halalas: number;
    line_total_halalas: number;
    devices: { id: string; serial_number: string; assigned: boolean; connected: boolean }[];
  }[];
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type ShippedKey = { serial_number: string; device_type: DeviceType; name: string | null; api_key: string };

export type Overview = {
  companies: { total: number; new_30d: number };
  users: { active: number };
  employees: { active: number };
  devices: { active: number; online: number; by_type: Record<DeviceType, number>; by_source: Record<DeviceSource, number> };
  orders: {
    by_status: Record<OrderStatus, number>;
    revenue_halalas: number;
    revenue_30d_halalas: number;
    daily: { day: string; orders: number; revenue_halalas: number }[];
    recent: AdminOrder[];
  };
  low_stock: AdminProduct[];
};

export type AdminCompany = {
  id: string;
  name: string;
  commercial_registration: string | null;
  owner: { full_name: string; email: string } | null;
  users: number;
  employees: number;
  sites: number;
  devices: number;
  devices_online: number;
  orders: number;
  spent_halalas: number;
  created_at: string;
};

export type AdminDevice = {
  id: string;
  serial_number: string;
  device_type: DeviceType;
  source: DeviceSource;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  os: { name: string; version: string | null } | null;
  browser: string | null;
  is_active: boolean;
  health: DeviceHealth;
  battery_percent: number | null;
  last_seen_at: string | null;
  employee: { id: string; full_name: string } | null;
  company: { id: string; name: string };
  created_at: string;
};

export const ORDER_STATUS = {
  placed: { tone: "warn", label: "New" },
  shipped: { tone: "info", label: "Shipped" },
  delivered: { tone: "ok", label: "Delivered" },
  cancelled: { tone: "neutral", label: "Cancelled" },
} as const;
