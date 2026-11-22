export type LocationPhase = "idle" | "requesting" | "searching" | "active" | "denied" | "unavailable" | "unsupported" | "insecure";

export type Platform = "ios" | "android" | "other";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export const DENIED_STEPS: Record<Platform, string[]> = {
  ios: [
    "Open Settings → Privacy & Security → Location Services and turn it on.",
    "In the same screen open Safari Websites (or Chrome) and choose While Using the App, with Precise Location on.",
    "Back in the browser, tap the aA (or ⋯) button next to the address → Website Settings → Location → Allow.",
    "Reload this page and tap Start again.",
  ],
  android: [
    "Make sure Location is on in the quick settings.",
    "Tap the lock icon next to the address → Permissions → Location → Allow.",
    "Reload this page and tap Start again.",
  ],
  other: [
    "Click the lock icon next to the address and allow Location for this site.",
    "Make sure location services are on for your browser in the system settings.",
    "Reload this page and click Start again.",
  ],
};

export const PHASE_TEXT: Record<LocationPhase, string> = {
  idle: "Location paused",
  requesting: "Asking for permission…",
  searching: "Finding your position…",
  active: "Sharing location",
  denied: "Location is blocked",
  unavailable: "No position available",
  unsupported: "This browser cannot share its location",
  insecure: "Location needs a secure (https) address",
};

export function getQuickFix(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 }),
  );
}
