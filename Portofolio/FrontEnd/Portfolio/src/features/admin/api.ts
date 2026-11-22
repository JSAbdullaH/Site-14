import { platformFetch } from "@/shared/lib/platformApi";
import type { DeviceType } from "@/shared/lib/deviceTypes";
import type { PlatformAdmin } from "@/shared/lib/platformAuth";
import type {
  AdminCompany,
  AdminDevice,
  AdminOrder,
  AdminProduct,
  OrderStatus,
  Overview,
  Paged,
  ProductInput,
  ShippedKey,
} from "./types";

function qs(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") query.set(k, String(v));
  const text = query.toString();
  return text ? `?${text}` : "";
}

export const platformLogin = (email: string, password: string) =>
  platformFetch<{ access_token: string; expires_in: number; admin: PlatformAdmin }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getOverview = () => platformFetch<Overview>("/overview");

export const listCompanies = (p: { search?: string; page?: number }) =>
  platformFetch<Paged<AdminCompany>>(`/companies${qs({ ...p, limit: 25 })}`);

export const listAllDevices = (p: { search?: string; type?: DeviceType; health?: string; company_id?: string; page?: number }) =>
  platformFetch<Paged<AdminDevice>>(`/devices${qs({ ...p, limit: 50 })}`);

export const listAdminProducts = () => platformFetch<{ data: AdminProduct[] }>("/products");

export const createProduct = (body: ProductInput) =>
  platformFetch<AdminProduct>("/products", { method: "POST", body: JSON.stringify(body) });

export const updateProduct = (id: string, body: Partial<ProductInput>) =>
  platformFetch<AdminProduct>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const listAdminOrders = (p: { status?: OrderStatus; search?: string; page?: number }) =>
  platformFetch<Paged<AdminOrder>>(`/orders${qs({ ...p, limit: 25 })}`);

export const shipOrder = (id: string) =>
  platformFetch<{ order: AdminOrder; keys: ShippedKey[] }>(`/orders/${id}/ship`, { method: "POST" });

export const deliverOrder = (id: string) => platformFetch<AdminOrder>(`/orders/${id}/deliver`, { method: "POST" });

export const cancelOrder = (id: string) => platformFetch<AdminOrder>(`/orders/${id}/cancel`, { method: "POST" });
