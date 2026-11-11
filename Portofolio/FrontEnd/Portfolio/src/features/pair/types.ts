import type { DeviceType } from "@/shared/lib/deviceTypes";

export type PairingInfo = {
  company_name: string;
  employee: { full_name: string } | null;
  label: string | null;
  expires_at: string;
};

export type ClaimInput = {
  device_type?: DeviceType;
  name?: string;
  model?: string;
  platform_version?: string;
  touch_points?: number;
  has_battery?: boolean;
  battery_percent?: number | null;
};

export type ClaimedDevice = {
  id: string;
  serial_number: string;
  device_type: DeviceType;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  os: { name: string; version: string | null } | null;
  browser: string | null;
  employee: { full_name: string } | null;
};

export type ClaimResponse = {
  company_name: string;
  serial_number: string;
  api_key: string;
  device: ClaimedDevice;
};

export type StoredDevice = {
  serial_number: string;
  api_key: string;
  company_name: string;
  name: string;
  device_type: DeviceType;
};

export type RefusalCode = "DEVICE_UNASSIGNED" | "NO_CONSENT" | "NO_SITE";

export type Heartbeat = {
  server_time: string;
  device: { serial_number: string; name: string | null; device_type: DeviceType };
  company_name: string;
  wearer: { full_name: string } | null;
  site: { name: string } | null;
  ready: boolean;
  reason: RefusalCode | null;
};

export type Reading = {
  recorded_at: string;
  latitude: number;
  longitude: number;
  battery_percent: number | null;
};

export type IngestResult = {
  accepted: number;
  stored: number;
  location_status: "in_zone" | "on_site" | "off_site";
};

export type DetectedDevice = ClaimInput & {
  guess: DeviceType;
  choices: DeviceType[];
  summary: string;
};

export const REFUSAL_TEXT: Record<RefusalCode, string> = {
  DEVICE_UNASSIGNED: "Connected. Waiting for your company to assign this device to an employee.",
  NO_CONSENT: "Connected. The employee carrying this device has not signed the tracking consent yet.",
  NO_SITE: "Connected. The employee carrying this device is not assigned to a site yet.",
};
