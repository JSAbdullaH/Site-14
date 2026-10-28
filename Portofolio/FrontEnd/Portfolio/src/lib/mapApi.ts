import { ApiError, apiFetch } from "./api";

export type LngLat = [number, number];

export type LatLng = { lat: number; lng: number };

export type Polygon = { type: "Polygon"; coordinates: LngLat[][] };

export type Geofence = {
  id: string;
  site_id: string;
  name: string;
  is_outdoor: boolean;
  boundary: Polygon;
  is_active: boolean;
};

export type LocationStatus = "in_zone" | "on_site" | "off_site";

export type LiveWorker = {
  employee_id: string;
  full_name: string;
  job_category: string;
  location_status: LocationStatus;
  zone: { id: string; name: string; is_outdoor: boolean } | null;
  latitude: number;
  longitude: number;
  battery_percent: number | null;
  heart_rate_bpm: number | null;
  recorded_at: string;
};

export type SiteOption = { id: string; name: string };

export const getLive = (siteId: string) =>
  apiFetch<{ site_id: string; site: { id: string; name: string; boundary: Polygon }; data: LiveWorker[] }>(
    `/locations/live?site_id=${siteId}`,
  );

export const listZones = (siteId: string) =>
  apiFetch<{ data: Geofence[] }>(`/geofences?site_id=${siteId}&is_active=true`);

export const createZone = (body: { site_id: string; name: string; is_outdoor: boolean; boundary: Polygon }) =>
  apiFetch<Geofence>("/geofences", { method: "POST", body: JSON.stringify(body) });

export const updateZone = (id: string, body: Partial<Pick<Geofence, "name" | "is_outdoor" | "boundary">>) =>
  apiFetch<Geofence>(`/geofences/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deactivateZone = (id: string) => apiFetch<void>(`/geofences/${id}`, { method: "DELETE" });

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
