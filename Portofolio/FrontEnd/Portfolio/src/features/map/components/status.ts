import type { LocationStatus } from "../api";

export const STATUS: Record<
  LocationStatus,
  { label: string; color: string; bg: string }
> = {
  in_zone: { label: "In zone", color: "#4F7A5B", bg: "#E4EBE4" },
  on_site: { label: "On site", color: "#DB4406", bg: "#FBE3D8" },
  off_site: { label: "Off site", color: "#8E8A82", bg: "#EDE7DD" },
};