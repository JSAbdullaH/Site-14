import type { DeviceType } from "./deviceTypes";

export type PresenceEventType = "site_enter" | "site_exit" | "zone_enter" | "zone_exit" | "device_offline" | "device_online";

export type PresenceEvent = {
  id: string;
  type: PresenceEventType;
  employee: { id: string; full_name: string };
  site: { id: string; name: string };
  zone_name: string | null;
  from_zone_name: string | null;
  device: { id: string; serial_number: string; name: string | null; device_type: DeviceType } | null;
  alert: { id: string; resolved: boolean; acknowledged: boolean } | null;
  latitude: number | null;
  longitude: number | null;
  occurred_at: string;
  created_at: string;
};

export type NotificationsResponse = {
  data: PresenceEvent[];
  unread_count: number;
  unread_capped: boolean;
  read_at: string | null;
  server_time: string;
};

export type AlertSummary = { open: number; unacknowledged: number; by_type: Record<string, number> };

export const EVENT_TONE: Record<PresenceEventType, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  zone_enter: "ok",
  zone_exit: "danger",
  site_enter: "info",
  site_exit: "neutral",
  device_offline: "warn",
  device_online: "ok",
};

export function describeEvent(e: PresenceEvent) {
  const name = e.employee.full_name;
  switch (e.type) {
    case "zone_exit":
      return { title: `${name} is out of zone`, detail: `Left ${e.zone_name ?? "the work zone"} · ${e.site.name}` };
    case "zone_enter":
      return {
        title: `${name} entered ${e.zone_name ?? "a zone"}`,
        detail: e.from_zone_name ? `Moved from ${e.from_zone_name} · ${e.site.name}` : e.site.name,
      };
    case "site_enter":
      return { title: `${name} arrived on site`, detail: e.site.name };
    case "site_exit":
      return { title: `${name} left the site`, detail: e.site.name };
    case "device_offline":
      return { title: `${name} is offline`, detail: `Device stopped sending · ${e.site.name}` };
    case "device_online":
      return { title: `${name} is back online`, detail: e.site.name };
  }
}

export function sinceLabel(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min ago`;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function durationLabel(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
