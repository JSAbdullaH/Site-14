export type DeviceType = "phone" | "tablet" | "watch" | "laptop" | "desktop" | "tracker";

export type DeviceSource = "registered" | "paired" | "marketplace";

export type DeviceHealth = "online" | "offline" | "never" | "inactive";

export const DEVICE_TYPES: DeviceType[] = ["phone", "watch", "tablet", "laptop", "desktop", "tracker"];

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  phone: "Phone",
  tablet: "Tablet",
  watch: "Watch",
  laptop: "Laptop",
  desktop: "Desktop",
  tracker: "GPS tracker",
};

export const DEVICE_SOURCE_LABEL: Record<DeviceSource, string> = {
  registered: "Registered by serial",
  paired: "Connected from browser",
  marketplace: "Bought from SITE14",
};

export const HEALTH_BADGE = {
  online: { tone: "ok", label: "Online" },
  offline: { tone: "warn", label: "Offline" },
  never: { tone: "neutral", label: "Never connected" },
  inactive: { tone: "neutral", label: "Deactivated" },
} as const;

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
