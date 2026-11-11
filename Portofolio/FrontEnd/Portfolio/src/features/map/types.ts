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

export type LiveStatus =
  | "in_zone"
  | "out_of_zone"
  | "on_site"
  | "offline"
  | "off_site"
  | "waiting"
  | "no_consent"
  | "no_device";

export type LiveWorker = {
  employee_id: string;
  full_name: string;
  job_category: string;
  employee_number: string | null;
  status: LiveStatus;
  location_status: LocationStatus;
  has_position: boolean;
  consent: boolean;
  zone: { id: string; name: string; is_outdoor: boolean } | null;
  out_of_zone: { alert_id: string; since: string; left_zone: string | null; acknowledged: boolean } | null;
  shift_started_at: string | null;
  device: {
    id: string;
    serial_number: string;
    name: string | null;
    device_type: string;
    last_seen_at: string | null;
    online: boolean;
  } | null;
  latitude: number | null;
  longitude: number | null;
  battery_percent: number | null;
  heart_rate_bpm: number | null;
  recorded_at: string | null;
};

export type PositionedWorker = LiveWorker & { latitude: number; longitude: number; recorded_at: string };

export const isPositioned = (w: LiveWorker): w is PositionedWorker =>
  w.latitude !== null && w.longitude !== null && w.recorded_at !== null;

export type SiteOption = { id: string; name: string };