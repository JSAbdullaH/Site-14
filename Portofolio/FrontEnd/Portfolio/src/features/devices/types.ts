import { deviceSerial } from "@/shared/lib/validation";
import type { DeviceHealth, DeviceSource, DeviceType } from "@/shared/lib/deviceTypes";

export type { DeviceHealth, DeviceSource, DeviceType };

export type Device = {
  id: string;
  serial_number: string;
  device_type: DeviceType;
  source: DeviceSource;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  os: { name: string; version: string | null } | null;
  browser: string | null;
  is_active: boolean;
  health: DeviceHealth;
  employee: {
    id: string;
    full_name: string;
    site: { id: string; name: string } | null;
  } | null;
  order: { id: string; reference_number: string; status: "placed" | "shipped" | "delivered" | "cancelled" } | null;
  battery_percent: number | null;
  paired_at: string | null;
  last_seen_at: string | null;
  last_recorded_at: string | null;
  clock_offset_seconds: number | null;
  created_at: string;
};

export type DeviceWithKey = Device & { api_key: string };

export type ListDevicesResponse = {
  data: Device[];
  page: number;
  limit: number;
  total: number;
};

export type DeviceSummary = {
  active: number;
  online: number;
  offline: number;
  never: number;
  unassigned: number;
  inactive: number;
  in_transit: number;
  pending_pairings: number;
  by_type: Record<DeviceType, number>;
};

export type DeviceFilter = "active" | "online" | "offline" | "never" | "unassigned" | "inactive";

export type Pairing = {
  id: string;
  status: "pending" | "claimed" | "cancelled" | "expired";
  label: string | null;
  employee: { id: string; full_name: string } | null;
  device: Device | null;
  expires_at: string;
  claimed_at: string | null;
  created_at: string;
};

export type NewPairing = Pairing & { code: string };

export type EmployeeOption = {
  id: string;
  full_name: string;
  site_name: string | null;
  consent_given_at: string | null;
  device: { id: string; serial_number: string } | null;
};

export function displayName(d: Device) {
  return d.name || [d.manufacturer, d.model].filter(Boolean).join(" ") || d.serial_number;
}

export function deviceDetails(d: Device) {
  const os = d.os ? [d.os.name, d.os.version].filter(Boolean).join(" ") : null;
  return [os, d.browser].filter(Boolean).join(" · ");
}

export function inTransit(d: Device) {
  return d.order?.status === "placed" || d.order?.status === "shipped";
}

export function clockLabel(offset: number | null) {
  if (offset === null || Math.abs(offset) < 5) return null;
  return offset > 0 ? `${offset} s slow` : `${-offset} s fast`;
}

export function parseSerials(text: string) {
  const serials: string[] = [];
  const repeated = new Set<string>();
  const invalid: { serial: string; message: string }[] = [];

  for (const cell of text.split(/[\r\n\t,;]+/)) {
    const raw = cell.trim();
    if (!raw) continue;
    const parsed = deviceSerial.safeParse(raw);
    if (!parsed.success) {
      invalid.push({ serial: raw, message: parsed.error.issues[0].message });
      continue;
    }
    if (serials.includes(parsed.data)) repeated.add(parsed.data);
    else serials.push(parsed.data);
  }
  return { serials, repeated: [...repeated], invalid };
}

export function keysCsv(devices: { serial_number: string; api_key: string }[]) {
  return ["serial_number,api_key", ...devices.map((d) => `${d.serial_number},${d.api_key}`)].join("\n");
}

export function pairUrl(code: string) {
  const base = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, "") || window.location.origin;
  return `${base}/pair/${code}`;
}
