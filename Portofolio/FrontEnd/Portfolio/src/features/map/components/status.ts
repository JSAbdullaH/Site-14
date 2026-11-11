import type { LiveStatus } from "../api";

export const STATUS: Record<LiveStatus, { label: string; color: string; bg: string }> = {
  in_zone: { label: "In zone", color: "#2F7D4F", bg: "#E8F3EC" },
  out_of_zone: { label: "Out of zone", color: "#B42318", bg: "#FBE6E4" },
  on_site: { label: "On site", color: "#DB4406", bg: "#FBE3D8" },
  offline: { label: "Offline", color: "#9A6B00", bg: "#FBF0D9" },
  off_site: { label: "Off site", color: "#8E8A82", bg: "#EDE7DD" },
};

export const EMPTY_COUNTS: Record<LiveStatus, number> = { in_zone: 0, out_of_zone: 0, on_site: 0, offline: 0, off_site: 0 };
