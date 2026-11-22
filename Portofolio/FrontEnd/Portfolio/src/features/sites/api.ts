import { apiFetch } from "@/shared/lib/api";
import type { ListSitesResponse, Site, SiteInput } from "./types";

export const listSites = (isActive?: boolean) =>
  apiFetch<ListSitesResponse>(
    `/sites${isActive === undefined ? "" : `?is_active=${isActive}`}`,
  );

export const getSite = (id: string) => apiFetch<Site>(`/sites/${id}`);

export const createSite = (body: SiteInput) =>
  apiFetch<Site>("/sites", { method: "POST", body: JSON.stringify(body) });

export const updateSite = (
  id: string,
  body: Partial<SiteInput & { is_active: boolean }>,
) => apiFetch<Site>(`/sites/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deactivateSite = (id: string) =>
  apiFetch<void>(`/sites/${id}`, { method: "DELETE" });

// SITE-50: the site the live map shows, remembered between visits.
const ACTIVE_SITE_KEY = "site14.activeSite";

export function getActiveSiteId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SITE_KEY);
  } catch {
    return null;
  }
}

export function setActiveSiteId(id: string) {
  try {
    localStorage.setItem(ACTIVE_SITE_KEY, id);
  } catch {
    // remembering the choice is a convenience only
  }
}
