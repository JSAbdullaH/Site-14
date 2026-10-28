import { apiFetch } from "@/shared/lib/api";
import type { ListSitesResponse, Site } from "./types";
import type { Polygon } from "@/features/map/types";

export const listSites = (isActive?: boolean) =>
  apiFetch<ListSitesResponse>(
    `/sites${isActive === undefined ? "" : `?is_active=${isActive}`}`,
  );

export const createSite = (body: { name: string; boundary: Polygon }) =>
  apiFetch<Site>("/sites", { method: "POST", body: JSON.stringify(body) });

export const updateSite = (
  id: string,
  body: Partial<Pick<Site, "name" | "boundary" | "is_active">>,
) => apiFetch<Site>(`/sites/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deactivateSite = (id: string) =>
  apiFetch<void>(`/sites/${id}`, { method: "DELETE" });