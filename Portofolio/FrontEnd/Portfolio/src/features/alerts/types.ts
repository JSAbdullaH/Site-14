export type AlertType = "zone_exit" | "hour_limit" | "midday_ban" | "heart_rate_high" | "heart_rate_low";

export type Alert = {
  id: string;
  type: AlertType;
  status: "open" | "resolved";
  employee: { id: string; full_name: string; job_category: string };
  site: { id: string; name: string };
  zone: { id: string; name: string } | null;
  latitude: number;
  longitude: number;
  limit_minutes: number | null;
  observed_minutes: number | null;
  limit_bpm: number | null;
  observed_bpm: number | null;
  duration_seconds: number;
  triggered_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: { id: string; full_name: string } | null;
};

export type ListAlertsResponse = { data: Alert[]; page: number; limit: number; total: number };

export const ALERT_LABEL: Record<AlertType, string> = {
  zone_exit: "Out of zone",
  hour_limit: "Over daily hours",
  midday_ban: "Midday work ban",
  heart_rate_high: "High heart rate",
  heart_rate_low: "Low heart rate",
};

export function alertDetail(a: Alert) {
  switch (a.type) {
    case "zone_exit":
      return `Left ${a.zone?.name ?? "the work zone"}`;
    case "hour_limit":
      return `${a.observed_minutes} of ${a.limit_minutes} minutes`;
    case "midday_ban":
      return `Outdoors in ${a.zone?.name ?? "a zone"} during the ban`;
    case "heart_rate_high":
    case "heart_rate_low":
      return `${a.observed_bpm} bpm, limit ${a.limit_bpm}`;
  }
}
