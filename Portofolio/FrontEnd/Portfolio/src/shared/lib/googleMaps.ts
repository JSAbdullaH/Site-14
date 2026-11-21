import { useEffect, useState } from "react";
import "./googleMaps.css";

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export type Maps = typeof google.maps;
export type LatLngLiteral = google.maps.LatLngLiteral;

let loading: Promise<Maps> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

const AUTH_ERROR =
  "Google Maps rejected the API key. Check that the Maps JavaScript API is enabled, billing is on, and this domain is allowed for the key.";

export function loadGoogleMaps(): Promise<Maps> {
  if (loading) return loading;
  loading = new Promise<Maps>((resolve, reject) => {
    if (!KEY) {
      reject(new Error("Google Maps key is missing. Set VITE_GOOGLE_MAPS_API_KEY in .env.local."));
      return;
    }
    const w = window as unknown as Record<string, unknown>;
    w.gm_authFailure = () => {
      authFailed = true;
      authListeners.forEach((fn) => fn());
    };
    w.__s14MapsReady = async () => {
      try {
        await Promise.all([google.maps.importLibrary("core"), google.maps.importLibrary("maps")]);
        resolve(google.maps);
      } catch (err) {
        reject(err as Error);
      }
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&loading=async&callback=__s14MapsReady`;
    script.async = true;
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error("Could not reach Google Maps. Check the internet connection."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export function useGoogleMaps() {
  const [api, setApi] = useState<Maps | null>(null);
  const [error, setError] = useState<string | null>(authFailed ? AUTH_ERROR : null);
  useEffect(() => {
    let live = true;
    loadGoogleMaps().then(
      (maps) => live && setApi(() => maps),
      (err: Error) => live && setError(err.message),
    );
    const onAuth = () => live && setError(AUTH_ERROR);
    authListeners.add(onAuth);
    return () => {
      live = false;
      authListeners.delete(onAuth);
    };
  }, []);
  return { api, error };
}

// Points of interest are noise on a construction site map: shops, restaurants and bus stops go.
export const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export const SATELLITE = "hybrid";
export const STREET = "roadmap";

export type HtmlOverlay = google.maps.OverlayView & {
  readonly el: HTMLElement;
  setPosition(position: LatLngLiteral): void;
  getPosition(): LatLngLiteral;
};

type OverlayOptions = {
  position: LatLngLiteral;
  el: HTMLElement;
  pane?: keyof google.maps.MapPanes;
  interactive?: boolean;
  map?: google.maps.Map | null;
};

type OverlayCtor = new (opts: OverlayOptions) => HtmlOverlay;
let OverlayClass: OverlayCtor | null = null;

function overlayClass(api: Maps): OverlayCtor {
  if (OverlayClass) return OverlayClass;
  class Overlay extends api.OverlayView {
    readonly el: HTMLElement;
    private pos: LatLngLiteral;
    private pane: keyof google.maps.MapPanes;

    constructor({ position, el, pane = "overlayLayer", interactive = false }: OverlayOptions) {
      super();
      this.el = el;
      this.pos = position;
      this.pane = pane;
      el.classList.add("gm-html");
      if (interactive) api.OverlayView.preventMapHitsAndGesturesFrom(el);
    }

    onAdd() {
      this.getPanes()?.[this.pane].appendChild(this.el);
    }

    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(this.pos);
      if (!p) return;
      this.el.style.left = `${p.x}px`;
      this.el.style.top = `${p.y}px`;
    }

    onRemove() {
      this.el.remove();
    }

    setPosition(position: LatLngLiteral) {
      this.pos = position;
      if (this.getMap()) this.draw();
    }

    getPosition() {
      return this.pos;
    }
  }
  OverlayClass = Overlay;
  return Overlay;
}

export function htmlOverlay(api: Maps, opts: OverlayOptions): HtmlOverlay {
  const overlay = new (overlayClass(api))(opts);
  if (opts.map) overlay.setMap(opts.map);
  return overlay;
}

export function hoverTip(
  api: Maps,
  map: google.maps.Map,
  shape: google.maps.Polygon | google.maps.Polyline,
  text: string,
  className = "",
) {
  const el = document.createElement("div");
  el.className = `gm-tip ${className}`;
  el.textContent = text;
  const tip = htmlOverlay(api, { el, position: map.getCenter()?.toJSON() ?? { lat: 0, lng: 0 }, pane: "floatPane" });
  const show = (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    tip.setPosition(e.latLng.toJSON());
    if (!tip.getMap()) tip.setMap(map);
  };
  const listeners = [
    shape.addListener("mouseover", show),
    shape.addListener("mousemove", show),
    shape.addListener("mouseout", () => tip.setMap(null)),
  ];
  return () => {
    listeners.forEach((l) => l?.remove());
    tip.setMap(null);
  };
}

export function fitPoints(api: Maps, map: google.maps.Map, points: LatLngLiteral[], padding = 40, maxZoom = 18) {
  if (!points.length) return false;
  const bounds = new api.LatLngBounds();
  for (const p of points) bounds.extend(p);
  map.fitBounds(bounds, padding);
  api.event.addListenerOnce(map, "idle", () => {
    if ((map.getZoom() ?? 0) > maxZoom) map.setZoom(maxZoom);
  });
  return true;
}

export function pixelDistance(map: google.maps.Map, a: LatLngLiteral, b: LatLngLiteral) {
  const proj = map.getProjection();
  if (!proj) return Infinity;
  const scale = 2 ** (map.getZoom() ?? 0);
  const pa = proj.fromLatLngToPoint(a);
  const pb = proj.fromLatLngToPoint(b);
  if (!pa || !pb) return Infinity;
  return Math.hypot((pa.x - pb.x) * scale, (pa.y - pb.y) * scale);
}

export function metres(a: LatLngLiteral, b: LatLngLiteral) {
  const R = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function shiftDown(map: google.maps.Map, at: LatLngLiteral, dy: number, zoom: number): LatLngLiteral {
  const proj = map.getProjection();
  const p = proj?.fromLatLngToPoint(at);
  if (!proj || !p || !dy) return at;
  const shifted = proj.fromPointToLatLng(new google.maps.Point(p.x, p.y + dy / 2 ** zoom));
  return shifted ? shifted.toJSON() : at;
}

export function dashed(color: string, opacity = 1, gap = 10): Partial<google.maps.PolylineOptions> {
  return {
    strokeOpacity: 0,
    icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: color, strokeOpacity: opacity, scale: 2 }, offset: "0", repeat: `${gap}px` }],
  };
}

// ---------------------------------------------------------------- place search

export type PlaceHit = { id: string; title: string; subtitle: string; prediction: google.maps.places.PlacePrediction };

// Address search needs the Places API (New) enabled for the key. When it is not, the first
// request fails and place search switches itself off instead of failing on every keystroke.
let placesOff = false;
let placesLib: Promise<google.maps.PlacesLibrary> | null = null;

export const placesAvailable = () => !placesOff;

export function newPlaceSession() {
  return placesOff || typeof google === "undefined" || !google.maps.places?.AutocompleteSessionToken
    ? null
    : new google.maps.places.AutocompleteSessionToken();
}

export async function suggestPlaces(
  input: string,
  near: google.maps.LatLng | null,
  session: google.maps.places.AutocompleteSessionToken | null,
): Promise<PlaceHit[] | null> {
  if (placesOff) return null;
  try {
    placesLib ??= google.maps.importLibrary("places") as Promise<google.maps.PlacesLibrary>;
    const { AutocompleteSuggestion } = await placesLib;
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      ...(near ? { locationBias: { center: near, radius: 30_000 } } : {}),
      ...(session ? { sessionToken: session } : {}),
    });
    return suggestions.flatMap((s) => {
      const p = s.placePrediction;
      if (!p) return [];
      return [{ id: p.placeId, title: p.mainText?.text ?? p.text.text, subtitle: p.secondaryText?.text ?? "", prediction: p }];
    });
  } catch {
    placesOff = true;
    return null;
  }
}

export async function placeLocation(hit: PlaceHit): Promise<LatLngLiteral | null> {
  try {
    const place = hit.prediction.toPlace();
    await place.fetchFields({ fields: ["location"] });
    return place.location ? place.location.toJSON() : null;
  } catch {
    return null;
  }
}
