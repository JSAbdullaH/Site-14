import { deviceSerial } from "@/shared/lib/validation";

export type Device = {
  id: string;
  serial_number: string;
  is_active: boolean;
  employee: {
    id: string;
    full_name: string;
    site: { id: string; name: string } | null;
  } | null;
  // Server clock of the device's last call.
  last_seen_at: string | null;
  // Device clock of its newest accepted reading.
  last_recorded_at: string | null;
  // Server clock minus device clock: positive means the device runs slow.
  clock_offset_seconds: number | null;
  created_at: string;
};

// Returned once, when a device is registered or given a new key.
export type DeviceWithKey = Device & { api_key: string };

export type ListDevicesResponse = {
  data: Device[];
  page: number;
  limit: number;
  total: number;
};

export type EmployeeOption = {
  id: string;
  full_name: string;
  site_name: string | null;
  consent_given_at: string | null;
  device: { id: string; serial_number: string } | null;
};

// Heard from in the last two minutes. Devices send every few seconds.
const ONLINE_MS = 2 * 60_000;

export type DeviceHealth = "online" | "offline" | "never" | "inactive";

export function deviceHealth(d: Device, now = Date.now()): DeviceHealth {
  if (!d.is_active) return "inactive";
  if (!d.last_seen_at) return "never";
  return now - Date.parse(d.last_seen_at) < ONLINE_MS ? "online" : "offline";
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

// A few seconds either way is network delay, not drift.
export function clockLabel(offset: number | null) {
  if (offset === null || Math.abs(offset) < 5) return null;
  return offset > 0 ? `${offset} s slow` : `${-offset} s fast`;
}

// One serial per line; tabs, commas and semicolons also separate them, so cells
// pasted from a spreadsheet work too. Not spaces: "GPS 001" is a typo, not two devices.
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

// The file the simulator reads with --keys.
export function keysCsv(devices: DeviceWithKey[]) {
  return ["serial_number,api_key", ...devices.map((d) => `${d.serial_number},${d.api_key}`)].join("\n");
}
