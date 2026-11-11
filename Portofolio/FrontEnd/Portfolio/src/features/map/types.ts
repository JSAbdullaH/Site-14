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

export type LiveStatus = "in_zone" | "out_of_zone" | "on_site" | "offline" | "off_site";

export type LiveWorker = {
  employee_id: string;
  full_name: string;
  job_category: string;
  status: LiveStatus;
  location_status: LocationStatus;
  zone: { id: string; name: string; is_outdoor: boolean } | null;
  out_of_zone: { alert_id: string; since: string; left_zone: string | null; acknowledged: boolean } | null;
  device: { id: string; serial_number: string; name: string | null; device_type: string; last_seen_at: string | null } | null;
  latitude: number;
  longitude: number;
  battery_percent: number | null;
  heart_rate_bpm: number | null;
  recorded_at: string;
};

export type SiteOption = { id: string; name: string };