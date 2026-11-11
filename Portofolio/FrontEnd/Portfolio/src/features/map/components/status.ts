import type { LiveStatus } from "../api";

type StatusStyle = { label: string; color: string; bg: string; hint: string };

export const STATUS: Record<LiveStatus, StatusStyle> = {
  out_of_zone: { label: "Out of zone", color: "#B42318", bg: "#FBE6E4", hint: "On site, outside every work zone" },
  offline: { label: "Offline", color: "#9A6B00", bg: "#FBF0D9", hint: "On shift, but the device stopped sending" },
  in_zone: { label: "In zone", color: "#2F7D4F", bg: "#E8F3EC", hint: "Inside a work zone" },
  on_site: { label: "On site", color: "#DB4406", bg: "#FBE3D8", hint: "Inside the site" },
  off_site: { label: "Off site", color: "#8E8A82", bg: "#EDE7DD", hint: "Not on site now" },
  waiting: { label: "Waiting", color: "#15607A", bg: "#E0F0F5", hint: "Device connected, no signal from the site yet" },
  no_consent: { label: "No consent", color: "#6B6862", bg: "#EFEEEC", hint: "Has not signed the tracking consent" },
  no_device: { label: "No device", color: "#6B6862", bg: "#EFEEEC", hint: "No device assigned" },
};

export const STATUS_ORDER: LiveStatus[] = ["out_of_zone", "offline", "in_zone", "on_site", "off_site", "waiting", "no_consent", "no_device"];

export const MAP_STATUSES: LiveStatus[] = ["in_zone", "out_of_zone", "offline", "on_site", "off_site"];

export const EMPTY_COUNTS: Record<LiveStatus, number> = {
  in_zone: 0,
  out_of_zone: 0,
  on_site: 0,
  offline: 0,
  off_site: 0,
  waiting: 0,
  no_consent: 0,
  no_device: 0,
};
