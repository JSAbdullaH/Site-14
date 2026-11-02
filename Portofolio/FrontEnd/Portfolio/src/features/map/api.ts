import { ApiError, apiFetch } from "@/shared/lib/api";
import type {
  Geofence,
  LatLng,
  LngLat,
  LiveWorker,
  Polygon,
  SiteOption,
} from "./types";

export * from "./types";

export const getLive = (siteId: string) =>
  apiFetch<{
    site_id: string;
    site: { id: string; name: string; boundary: Polygon };
    data: LiveWorker[];
  }>(`/locations/live?site_id=${siteId}`);

export const listZones = (siteId: string) =>
  apiFetch<{ data: Geofence[] }>(`/geofences?site_id=${siteId}&is_active=true`);

export const createZone = (body: {
  site_id: string;
  name: string;
  is_outdoor: boolean;
  boundary: Polygon;
}) =>
  apiFetch<Geofence>("/geofences", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateZone = (
  id: string,
  body: Partial<Pick<Geofence, "name" | "is_outdoor" | "boundary">>,
) =>
  apiFetch<Geofence>(`/geofences/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deactivateZone = (id: string) =>
  apiFetch<void>(`/geofences/${id}`, { method: "DELETE" });

export async function listSites(): Promise<SiteOption[]> {
  try {
    const res = await apiFetch<{ data: SiteOption[] }>("/sites?is_active=true");
    if (res.data.length) return res.data;
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }

  const demo = import.meta.env.VITE_DEMO_SITE_ID as string | undefined;
  return demo ? [{ id: demo, name: "Demo site" }] : [];
}

export function toPath(polygon: Polygon): LatLng[] {
  return polygon.coordinates[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
}

export function toPolygon(path: LatLng[]): Polygon {
  const ring: LngLat[] = path.map((p) => [round(p.lng), round(p.lat)]);
  ring.push(ring[0]);
  return { type: "Polygon", coordinates: [ring] };
}

const round = (n: number) => Math.round(n * 1e7) / 1e7;