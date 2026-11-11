import { apiFetch } from "@/shared/lib/api";
import type { NotificationsResponse } from "@/shared/lib/presence";
import type { Alert, AlertType, ListAlertsResponse } from "./types";

export function listAlerts(params: { status: "open" | "resolved" | "all"; type?: AlertType }) {
  const query = new URLSearchParams({ status: params.status, limit: "100" });
  if (params.type) query.set("type", params.type);
  return apiFetch<ListAlertsResponse>(`/alerts?${query}`);
}

export const acknowledgeAlert = (id: string) => apiFetch<Alert>(`/alerts/${id}/acknowledge`, { method: "POST" });

export const listActivity = (type?: string) =>
  apiFetch<NotificationsResponse>(`/notifications?limit=100${type ? `&type=${type}` : ""}`);
