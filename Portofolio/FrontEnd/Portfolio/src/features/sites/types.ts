import type { Polygon } from "@/features/map/types";

export type SiteSummary = {
  id: string;
  name: string;
  client: string | null;
  shift_start: string;
  shift_end: string;
  is_active: boolean;
  employee_count: number;
  on_site_count: number;
  created_at: string;
  updated_at: string;
};

// A single site carries its boundary; lists leave it out.
export type Site = SiteSummary & { boundary: Polygon };

export type SiteInput = {
  name: string;
  client: string | null;
  boundary: Polygon;
  shift_start: string;
  shift_end: string;
};

export type ListSitesResponse = {
  data: SiteSummary[];
};

export const shiftLabel = (site: Pick<SiteSummary, "shift_start" | "shift_end">) =>
  `${site.shift_start}–${site.shift_end}`;
