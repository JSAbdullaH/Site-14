import type { Polygon } from "@/features/map/types";

export type Site = {
  id: string;
  name: string;
  boundary: Polygon;
  is_active: boolean;
  created_at?: string;
};

export type ListSitesResponse = {
  data: Site[];
};