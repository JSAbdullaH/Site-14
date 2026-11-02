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