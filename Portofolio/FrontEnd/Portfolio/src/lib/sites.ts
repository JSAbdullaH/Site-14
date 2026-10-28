import { createContext, useContext } from "react";

export type SiteSummary = {
  id: string;
  name: string;
  client: string | null;
  shift_start: string;
  shift_end: string;
  is_active: boolean;
  employee_count: number;
  on_site_count: number;
};

export type Polygon = { type: "Polygon"; coordinates: [number, number][][] };

export type Site = SiteSummary & { boundary: Polygon };

export type SiteState = {
  // null until the first load finishes.
  sites: SiteSummary[] | null;
  error: string;
  // The site every screen shows. null when the company has no active site.
  activeSite: SiteSummary | null;
  setActiveSiteId: (id: string) => void;
  reload: () => Promise<void>;
};

export const SiteContext = createContext<SiteState | null>(null);

export function useSites(): SiteState {
  const state = useContext(SiteContext);
  if (!state) throw new Error("useSites must be used inside SiteProvider");
  return state;
}

export const shiftLabel = (site: Pick<SiteSummary, "shift_start" | "shift_end">) =>
  `${site.shift_start}–${site.shift_end}`;
