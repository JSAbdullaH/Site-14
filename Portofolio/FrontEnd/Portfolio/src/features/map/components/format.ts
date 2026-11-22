export const DASH = "—";

export function ago(iso: string | null, now = Date.now()) {
  if (!iso) return null;
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min ago`;
  return new Date(iso).toLocaleDateString();
}

export function duration(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export function batteryTone(pct: number | null) {
  if (pct === null) return "text-muted-foreground";
  if (pct <= 15) return "text-danger";
  if (pct <= 30) return "text-warn";
  return "text-ok";
}

// Floating panels share one surface so the map overlays read as a single system.
export const GLASS =
  "border border-black/5 bg-card/92 shadow-[0_8px_30px_rgba(0,0,0,0.16)] backdrop-blur-md supports-[backdrop-filter]:bg-card/85";
