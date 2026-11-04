export function todayInRiyadh() {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function clock(iso: string) {
  return new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(11, 16);
}

export function longDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export const ALERT_LABELS: Record<string, string> = {
  zone_exit: "Left the work zone",
  hour_limit: "Over the daily hour limit",
  midday_ban: "Outdoors during the midday ban",
  heart_rate_high: "Heart rate too high",
  heart_rate_low: "Heart rate too low",
};

export const FIELD_LABELS: Record<string, string> = {
  first_seen: "First seen",
  last_seen: "Last seen",
  worked_minutes: "Hours worked",
};
