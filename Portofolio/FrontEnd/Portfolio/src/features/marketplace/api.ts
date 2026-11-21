import { apiFetch } from "@/shared/lib/api";
import type { ListOrdersResponse, ListProductsResponse, Order, PlaceOrderInput } from "./types";

export const listProducts = () => apiFetch<ListProductsResponse>("/marketplace/products");

export const listOrders = () => apiFetch<ListOrdersResponse>("/marketplace/orders?limit=50");

export const placeOrder = (body: PlaceOrderInput) =>
  apiFetch<Order>("/marketplace/orders", { method: "POST", body: JSON.stringify(body) });
