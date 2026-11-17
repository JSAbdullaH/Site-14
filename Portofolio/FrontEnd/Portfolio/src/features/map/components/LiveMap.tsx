import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./map.css";
import { toast } from "sonner";
import { Check, Loader2, PenLine, Undo2, WifiOff, X } from "lucide-react";
import {
  createZone,
  deactivateZone,
  getLive,
  isOnMap,
  listZones,
  toPath,
  toPolygon,
  updateZone,
  type Geofence,
  type LatLng,
  type LiveStatus,
  type LiveWorker,
  type Polygon,
  type PositionedWorker,
} from "../api";
import { FILTER_STATUSES, STATUS, countByStatus } from "./status";
import { GLASS, ago, escapeHtml, firstName, initials } from "./format";
import MapControls, { type BaseLayer } from "./MapControls";
import RosterSheet from "./RosterSheet";
import WorkerPanel from "./WorkerPanel";
import ZoneCard from "./ZoneCard";
import ZonePanel from "./ZonePanel";
import MapSearch from "./MapSearch";
import {
  MAP_STYLES,
  SATELLITE,
  STREET,
  dashed,
  fitPoints,
  hoverTip,
  htmlOverlay,
  placeLocation,
  metres,
  pixelDistance,
  shiftDown,
  useGoogleMaps,
  type HtmlOverlay,
  type PlaceHit,
} from "@/shared/lib/googleMaps";

const POLL_MS = 7000;
const DEFAULT_OFFLINE_MS = 3 * 60_000;
const FALLBACK_CENTER: LatLng = { lat: 24.7136, lng: 46.6753 };
// Names show next to every marker from this zoom; below it, on hover or selection only.
const LABEL_ZOOM = 18;
// Zone labels hide when zoomed far out, where they would pile up.
const ZONE_LABEL_ZOOM = 15;
const FOCUS_ZOOM = 19;
const GLIDE_MS = 1100;
const LEAVE_MS = 320;
// Clicking within this many pixels of the first corner closes the shape.
const CLOSE_PX = 14;
// A ring around the world: the site boundary is cut out of it to dim everything outside.
const WORLD: LatLng[] = [-179.99, -90, 0, 90, 179.99]
  .map((lng) => ({ lat: 85, lng }))
  .concat([179.99, 90, 0, -90, -179.99].map((lng) => ({ lat: -85, lng })));

const DRAW_COLOR = "#DB4406";

type Mode =
  | { kind: "view" }
  | { kind: "drawing" }
  | { kind: "naming"; path: LatLng[] }
  | { kind: "editing"; zoneId: string };

type MarkerEntry = { overlay: HtmlOverlay; iconKey: string; pos: string; anim: number; leaving: number };
type ZoneEntry = { poly: google.maps.Polygon; label: HtmlOverlay };
type Draft = { fill: google.maps.Polygon; line: google.maps.Polyline; preview: google.maps.Polyline; dots: HtmlOverlay[] };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function workerHtml(w: PositionedWorker, selected: boolean) {
  const s = STATUS[w.status];
  const alert = w.status === "out_of_zone";
  return (
    `<div class="s14-worker${selected ? " is-selected" : ""}" style="--c:${s.color}">` +
    (alert ? '<span class="s14-pulse"></span>' : "") +
    `<span class="s14-dot">${escapeHtml(initials(w.full_name))}</span>` +
    `<span class="s14-label">${escapeHtml(firstName(w.full_name))}<em>${s.label}</em></span>` +
    `</div>`
  );
}

const zoneColor = (z: Geofence) => (z.is_outdoor ? "#DB4406" : "#4F7A5B");

const zoneStyle = (z: Geofence, selected: boolean, dimmed: boolean): google.maps.PolygonOptions => ({
  strokeColor: selected ? "#FFFFFF" : zoneColor(z),
  strokeWeight: selected ? 3 : 2,
  strokeOpacity: dimmed ? 0.5 : 1,
  fillColor: zoneColor(z),
  fillOpacity: selected ? 0.32 : dimmed ? 0.08 : 0.18,
});

const zoneLabel = (z: Geofence, count: number) =>
  `${z.is_outdoor ? "☀ " : ""}${escapeHtml(z.name)}${count ? `<b>${count}</b>` : ""}`;

// Twice the signed area: its sign tells which way the ring winds.
function ringArea(path: LatLng[]) {
  let a = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const q = path[(i + 1) % path.length];
    a += p.lng * q.lat - q.lng * p.lat;
  }
  return a;
}

function centroid(path: LatLng[]): LatLng {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const q = path[(i + 1) % path.length];
    const f = p.lng * q.lat - q.lng * p.lat;
    a += f;
    x += (p.lng + q.lng) * f;
    y += (p.lat + q.lat) * f;
  }
  if (Math.abs(a) < 1e-14) return path[0];
  return { lat: y / (3 * a), lng: x / (3 * a) };
}

const readPath = (poly: google.maps.Polygon): LatLng[] =>
  poly
    .getPath()
    .getArray()
    .map((p) => ({ lat: p.lat(), lng: p.lng() }));

type Props = { siteId: string | null; notice?: string | null; siteSwitcher?: ReactNode };

export default function LiveMap({ siteId, notice, siteSwitcher }: Props) {
  const { api, error: mapsError } = useGoogleMaps();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const zonesRef = useRef(new Map<string, ZoneEntry>());
  const siteShapesRef = useRef<{ shapes: (google.maps.Polygon | google.maps.Polyline)[]; outline: google.maps.Polyline; untip: () => void } | null>(
    null,
  );
  const fittedRef = useRef<string | null>(null);
  const placePinRef = useRef<HtmlOverlay | null>(null);

  // The zone being drawn: corners placed so far and the shapes that show them.
  const draftPointsRef = useRef<LatLng[]>([]);
  const draftRef = useRef<Draft | null>(null);

  const [ready, setReady] = useState(false);
  const [workers, setWorkers] = useState<LiveWorker[]>([]);
  const [zones, setZones] = useState<Geofence[]>([]);
  const [siteBoundary, setSiteBoundary] = useState<Polygon | null>(null);
  const [siteName, setSiteName] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [filter, setFilter] = useState<LiveStatus | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [draftCount, setDraftCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [offlineMs, setOfflineMs] = useState(DEFAULT_OFFLINE_MS);
  const [now, setNow] = useState(() => Date.now());
  const [base, setBase] = useState<BaseLayer>("satellite");
  const [fullscreen, setFullscreen] = useState(false);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  // A one-second clock for "updated 3s ago" and the "last heard" times.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // ---------------------------------------------------------------- map setup

  // Map events are bound once; these refs always point at the latest handlers.
  const onMapClickRef = useRef<(at: LatLng) => void>(() => {});
  const onMapMoveRef = useRef<(at: LatLng) => void>(() => {});
  const onZoneClickRef = useRef<(zoneId: string, at: LatLng) => void>(() => {});

  useEffect(() => {
    if (!api || !containerRef.current) return;
    const map = new api.Map(containerRef.current, {
      center: FALLBACK_CENTER,
      zoom: 16,
      mapTypeId: SATELLITE,
      styles: MAP_STYLES,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      clickableIcons: false,
      keyboardShortcuts: true,
      tilt: 0,
      minZoom: 3,
      maxZoom: 21,
      backgroundColor: "#1f1d1a",
    });

    const syncZoomClasses = () => {
      const z = map.getZoom() ?? 0;
      const el = map.getDiv();
      el.classList.toggle("s14-labels", z >= LABEL_ZOOM);
      el.classList.toggle("s14-far", z < ZONE_LABEL_ZOOM);
    };
    map.addListener("zoom_changed", syncZoomClasses);
    syncZoomClasses();
    map.addListener("click", (e: google.maps.MapMouseEvent) => e.latLng && onMapClickRef.current(e.latLng.toJSON()));
    map.addListener("mousemove", (e: google.maps.MapMouseEvent) => e.latLng && onMapMoveRef.current(e.latLng.toJSON()));

    mapRef.current = map;
    setReady(true);
    const markers = markersRef.current;
    const zoneShapes = zonesRef.current;
    return () => {
      for (const entry of markers.values()) {
        cancelAnimationFrame(entry.anim);
        window.clearTimeout(entry.leaving);
        entry.overlay.setMap(null);
      }
      for (const { poly, label } of zoneShapes.values()) {
        poly.setMap(null);
        label.setMap(null);
      }
      siteShapesRef.current?.shapes.forEach((s) => s.setMap(null));
      siteShapesRef.current?.untip();
      siteShapesRef.current = null;
      placePinRef.current?.setMap(null);
      placePinRef.current = null;
      api.event.clearInstanceListeners(map);
      mapRef.current = null;
      markers.clear();
      zoneShapes.clear();
      setReady(false);
    };
  }, [api]);

  useEffect(() => {
    if (ready) mapRef.current?.setMapTypeId(base === "satellite" ? SATELLITE : STREET);
  }, [ready, base]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // While drawing, every click places a corner: no double-click zoom, crosshair cursor.
  useEffect(() => {
    const drawing = mode.kind === "drawing";
    mapRef.current?.setOptions({ draggableCursor: drawing ? "crosshair" : null, disableDoubleClickZoom: drawing });
    siteShapesRef.current?.outline.setOptions({ clickable: !drawing });
  }, [ready, mode.kind]);

  // ---------------------------------------------------------------- data

  const refreshZones = useCallback(async () => {
    if (!siteId) return;
    const res = await listZones(siteId);
    setZones(res.data);
  }, [siteId]);

  useEffect(() => {
    setZones([]);
    setWorkers([]);
    setSiteBoundary(null);
    setSelectedWorker(null);
    setSelectedZone(null);
    setMode({ kind: "view" });
    refreshZones().catch((err: Error) => toast.error(`Could not load zones: ${err.message}`));
  }, [refreshZones]);

  useEffect(() => {
    if (!siteId) return;
    const id = siteId;
    let stopped = false;
    let inflight = false;
    async function tick() {
      if (document.hidden || inflight) return;
      inflight = true;
      try {
        const res = await getLive(id);
        if (stopped) return;
        setWorkers(res.data);
        setSiteBoundary(res.site.boundary);
        setSiteName(res.site.name);
        if (res.offline_after_minutes) setOfflineMs(res.offline_after_minutes * 60_000);
        setLastSync(Date.now());
        setPollError(null);
      } catch (err) {
        if (!stopped) setPollError((err as Error).message);
      } finally {
        inflight = false;
      }
    }
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    // Catch up straight away when the tab comes back to the front.
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [siteId]);

  // If the map itself cannot reach the server for longer than the device offline window,
  // every position on screen is as old as an offline worker's, so none are drawn.
  const stale = pollError !== null && lastSync !== null && now - lastSync > offlineMs;

  const live = useMemo(() => (stale ? [] : workers.filter(isOnMap)), [workers, stale]);
  const onMapIds = useMemo(() => new Set(live.map((w) => w.employee_id)), [live]);
  const shown = useMemo(() => (filter ? live.filter((w) => w.status === filter) : live), [live, filter]);
  const counts = useMemo(() => countByStatus(workers), [workers]);
  const zoneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of live) if (w.zone) m.set(w.zone.id, (m.get(w.zone.id) ?? 0) + 1);
    return m;
  }, [live]);

  // ---------------------------------------------------------------- zones

  useEffect(() => {
    const map = mapRef.current;
    if (!api || !ready || !map) return;
    const entries = zonesRef.current;
    const editingId = mode.kind === "editing" ? mode.zoneId : null;
    const focusId = editingId ?? selectedZone;
    const drawing = mode.kind === "drawing";
    const seen = new Set<string>();
    for (const z of zones) {
      seen.add(z.id);
      const path = toPath(z.boundary);
      let entry = entries.get(z.id);
      if (!entry) {
        const poly = new api.Polygon({ map, paths: path, zIndex: 1 });
        const zoneId = z.id;
        poly.addListener("click", (e: google.maps.PolyMouseEvent) => e.latLng && onZoneClickRef.current(zoneId, e.latLng.toJSON()));
        const el = document.createElement("div");
        el.className = "s14-zone-label";
        // Zone labels sit above the zone shapes but under the worker markers, so they never hide a person.
        const label = htmlOverlay(api, { el, position: centroid(path), pane: "overlayLayer", map });
        entry = { poly, label };
        entries.set(z.id, entry);
      } else if (z.id !== editingId) {
        // Also puts back the saved shape when an edit is cancelled.
        entry.poly.setPaths(path);
        entry.label.setPosition(centroid(path));
      }
      const editing = z.id === editingId;
      entry.poly.setOptions({
        ...zoneStyle(z, z.id === focusId, focusId !== null && z.id !== focusId),
        // While drawing, clicks over a zone go to the map so they place corners.
        clickable: !drawing,
        zIndex: editing ? 5 : 1,
      });
      if (entry.poly.getEditable() !== editing) entry.poly.setEditable(editing);
      entry.label.el.innerHTML = zoneLabel(z, zoneCounts.get(z.id) ?? 0);
    }
    for (const [id, entry] of entries) {
      if (seen.has(id)) continue;
      api.event.clearInstanceListeners(entry.poly);
      entry.poly.setMap(null);
      entry.label.setMap(null);
      entries.delete(id);
    }
  }, [api, ready, zones, mode, selectedZone, zoneCounts]);

  onZoneClickRef.current = (zoneId, at) => {
    const current = modeRef.current.kind;
    if (current === "drawing") {
      addDraftPoint(at);
    } else if (current === "view") {
      setSelectedWorker(null);
      setSelectedZone(zoneId);
    }
  };

  // ---------------------------------------------------------------- workers

  useEffect(() => {
    const map = mapRef.current;
    if (!api || !ready || !map) return;
    const markers = markersRef.current;
    const seen = new Set<string>();
    const motion = !reducedMotion();

    for (const w of shown) {
      seen.add(w.employee_id);
      const selected = w.employee_id === selectedWorker;
      const iconKey = `${w.status},${w.full_name},${selected}`;
      const pos = `${w.latitude},${w.longitude}`;
      let entry = markers.get(w.employee_id);

      if (entry && entry.leaving) {
        // Came back before the fade-out finished: keep the marker.
        window.clearTimeout(entry.leaving);
        entry.leaving = 0;
        entry.overlay.el.firstElementChild?.classList.remove("is-leaving");
      }

      if (!entry) {
        const el = document.createElement("div");
        el.className = "s14-marker";
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", w.full_name);
        el.title = w.full_name;
        el.innerHTML = workerHtml(w, selected);
        const id = w.employee_id;
        const open = () => {
          if (modeRef.current.kind !== "view") return;
          setSelectedZone(null);
          setSelectedWorker(id);
          const map = mapRef.current;
          if (map && map.getDiv().clientWidth < 768) {
            const at = entryLatLng(id);
            if (at) revealRef.current(at, map.getZoom() ?? FOCUS_ZOOM);
          }
        };
        el.addEventListener("click", open);
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        });
        const overlay = htmlOverlay(api, {
          el,
          position: { lat: w.latitude, lng: w.longitude },
          pane: "overlayMouseTarget",
          interactive: true,
          map,
        });
        entry = { overlay, iconKey, pos, anim: 0, leaving: 0 };
        markers.set(w.employee_id, entry);
      } else {
        if (entry.iconKey !== iconKey) {
          entry.overlay.el.innerHTML = workerHtml(w, selected);
          entry.iconKey = iconKey;
        }
        if (entry.pos !== pos) {
          glide(entry, { lat: w.latitude, lng: w.longitude }, motion && (map.getZoom() ?? 0) >= 14);
          entry.pos = pos;
        }
      }
      entry.overlay.el.style.zIndex = selected ? "3" : w.status === "out_of_zone" ? "2" : "1";
    }

    for (const [id, entry] of markers) {
      if (seen.has(id) || entry.leaving) continue;
      // Gone offline (or filtered out): fade the marker away, then take it off the map.
      cancelAnimationFrame(entry.anim);
      const el = entry.overlay.el.firstElementChild;
      if (!motion || !el) {
        entry.overlay.setMap(null);
        markers.delete(id);
        continue;
      }
      el.classList.add("is-leaving");
      entry.leaving = window.setTimeout(() => {
        entry.overlay.setMap(null);
        markers.delete(id);
      }, LEAVE_MS);
    }
  }, [api, ready, shown, selectedWorker]);

  function glide(entry: MarkerEntry, to: LatLng, animate: boolean) {
    cancelAnimationFrame(entry.anim);
    const from = entry.overlay.getPosition();
    // Jumps longer than ~300 m are a new fix, not movement: place them directly.
    if (!animate || metres(from, to) > 300) {
      entry.overlay.setPosition(to);
      return;
    }
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / GLIDE_MS);
      const e = 1 - (1 - k) ** 3;
      entry.overlay.setPosition({ lat: from.lat + (to.lat - from.lat) * e, lng: from.lng + (to.lng - from.lng) * e });
      if (k < 1) entry.anim = requestAnimationFrame(step);
    };
    entry.anim = requestAnimationFrame(step);
  }

  const entryLatLng = (id: string) => markersRef.current.get(id)?.overlay.getPosition() ?? null;
  const revealRef = useRef(reveal);
  revealRef.current = reveal;

  const hoverWorker = useCallback((id: string | null) => {
    for (const [key, entry] of markersRef.current) {
      entry.overlay.el.firstElementChild?.classList.toggle("is-hover", key === id);
    }
  }, []);

  // ---------------------------------------------------------------- site boundary

  useEffect(() => {
    const map = mapRef.current;
    siteShapesRef.current?.shapes.forEach((s) => s.setMap(null));
    siteShapesRef.current?.untip();
    siteShapesRef.current = null;
    if (!api || !ready || !map || !siteBoundary) return;
    const path = toPath(siteBoundary);
    // A hole has to wind the other way round from the ring it is cut out of.
    const hole = Math.sign(ringArea(path)) === Math.sign(ringArea(WORLD)) ? [...path].reverse() : path;
    const ring = [...path, path[0]];
    // Everything outside the site is dimmed, so the site reads as the focus of the map.
    const mask = new api.Polygon({ map, paths: [WORLD, hole], strokeWeight: 0, fillColor: "#0B0A08", fillOpacity: 0.42, clickable: false, zIndex: 0 });
    // A white halo under a bright outline keeps the perimeter readable on satellite imagery.
    const halo = new api.Polyline({ map, path: ring, strokeColor: "#FFFFFF", strokeWeight: 7, strokeOpacity: 0.75, clickable: false, zIndex: 2 });
    const outline = new api.Polyline({
      map,
      path: ring,
      strokeColor: "#FACC15",
      strokeWeight: 3,
      zIndex: 3,
      clickable: modeRef.current.kind !== "drawing",
    });
    const untip = hoverTip(api, map, outline, siteName || "Site boundary");
    siteShapesRef.current = { shapes: [mask, halo, outline], outline, untip };
  }, [api, ready, siteBoundary, siteName]);

  const fitSite = useCallback(() => {
    const map = mapRef.current;
    if (!api || !map) return false;
    const points: LatLng[] = [
      ...(siteBoundary ? toPath(siteBoundary) : []),
      ...zones.flatMap((z) => toPath(z.boundary)),
      ...(siteBoundary ? [] : live.map((w) => ({ lat: w.latitude, lng: w.longitude }))),
    ];
    return fitPoints(api, map, points, 56, 18);
  }, [api, siteBoundary, zones, live]);

  useEffect(() => {
    // Wait for the first live poll: it carries the site boundary, which frames the view.
    if (!ready || fittedRef.current === siteId || lastSync === null) return;
    if (fitSite()) fittedRef.current = siteId;
  }, [ready, siteId, fitSite, lastSync]);

  // ---------------------------------------------------------------- drawing

  function renderDraft(cursor?: LatLng) {
    const d = draftRef.current;
    const map = mapRef.current;
    if (!d || !api || !map) return;
    const pts = draftPointsRef.current;
    d.line.setPath(pts);
    d.fill.setPaths(pts.length >= 3 ? pts : []);
    d.preview.setPath(cursor && pts.length ? [pts[pts.length - 1], cursor, ...(pts.length >= 2 ? [pts[0]] : [])] : []);
    while (d.dots.length > pts.length) d.dots.pop()?.setMap(null);
    pts.forEach((p, i) => {
      let dot = d.dots[i];
      if (!dot) {
        const el = document.createElement("div");
        el.className = "s14-draft-dot";
        dot = htmlOverlay(api, { el, position: p, pane: "floatPane", map });
        d.dots.push(dot);
      }
      dot.setPosition(p);
      dot.el.classList.toggle("is-closable", i === 0 && pts.length >= 3);
    });
  }

  function addDraftPoint(at: LatLng) {
    const map = mapRef.current;
    const pts = draftPointsRef.current;
    if (!map) return;
    if (pts.length >= 3 && pixelDistance(map, pts[0], at) <= CLOSE_PX) {
      finishDrawing();
      return;
    }
    pts.push(at);
    setDraftCount(pts.length);
    renderDraft(at);
  }

  onMapClickRef.current = (at) => {
    const kind = modeRef.current.kind;
    if (kind === "drawing") addDraftPoint(at);
    else if (kind === "view") {
      setSelectedWorker(null);
      setSelectedZone(null);
    }
  };

  onMapMoveRef.current = (at) => {
    if (modeRef.current.kind === "drawing" && draftPointsRef.current.length) renderDraft(at);
  };

  function startDrawing() {
    const map = mapRef.current;
    if (!api || !map) return;
    setSelectedWorker(null);
    setSelectedZone(null);
    setFilter(null);
    setZoneError(null);
    clearDraft();
    draftRef.current = {
      fill: new api.Polygon({ map, strokeWeight: 0, fillColor: DRAW_COLOR, fillOpacity: 0.18, clickable: false, zIndex: 10 }),
      line: new api.Polyline({ map, strokeColor: DRAW_COLOR, strokeWeight: 3, clickable: false, zIndex: 11 }),
      preview: new api.Polyline({ map, ...dashed("#FFFFFF", 0.9), clickable: false, zIndex: 12 }),
      dots: [],
    };
    draftPointsRef.current = [];
    setDraftCount(0);
    setMode({ kind: "drawing" });
  }

  function undoPoint() {
    draftPointsRef.current.pop();
    setDraftCount(draftPointsRef.current.length);
    renderDraft();
  }

  function clearDraft() {
    const d = draftRef.current;
    if (d) {
      d.fill.setMap(null);
      d.line.setMap(null);
      d.preview.setMap(null);
      d.dots.forEach((dot) => dot.setMap(null));
    }
    draftRef.current = null;
    draftPointsRef.current = [];
    setDraftCount(0);
  }

  function finishDrawing() {
    const pts = draftPointsRef.current;
    if (pts.length < 3 || !draftRef.current) return;
    const path = pts.map(({ lat, lng }) => ({ lat, lng }));
    draftRef.current.line.setPath([...pts, pts[0]]);
    draftRef.current.preview.setPath([]);
    setMode({ kind: "naming", path });
  }

  function cancelZone() {
    // Leaving edit mode makes the zones effect put the saved shape back.
    clearDraft();
    setZoneError(null);
    setMode({ kind: "view" });
  }

  async function saveZone(values: { name: string; is_outdoor: boolean }) {
    setSaving(true);
    setZoneError(null);
    try {
      if (mode.kind === "naming" && siteId) {
        await createZone({ site_id: siteId, ...values, boundary: toPolygon(mode.path) });
        clearDraft();
        toast.success(`Zone “${values.name}” created`);
      } else if (mode.kind === "editing") {
        const poly = zonesRef.current.get(mode.zoneId)?.poly;
        const path = poly ? readPath(poly) : [];
        await updateZone(mode.zoneId, { ...values, ...(path.length >= 3 ? { boundary: toPolygon(path) } : {}) });
        toast.success(`Zone “${values.name}” saved`);
      }
      await refreshZones();
      setMode({ kind: "view" });
    } catch (err) {
      setZoneError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeZone() {
    if (mode.kind !== "editing") return;
    if (!window.confirm("Deactivate this zone? Its history is kept.")) return;
    setSaving(true);
    try {
      await deactivateZone(mode.zoneId);
      await refreshZones();
      setMode({ kind: "view" });
      toast.success("Zone deactivated");
    } catch (err) {
      setZoneError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------- keyboard

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (mode.kind === "drawing") {
      if (e.key === "Escape") cancelZone();
      else if (e.key === "Enter") finishDrawing();
      else if (e.key === "Backspace" || (e.key === "z" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        undoPoint();
      }
    } else if (e.key === "Escape") {
      if (mode.kind !== "view") cancelZone();
      else if (selectedWorker || selectedZone) {
        setSelectedWorker(null);
        setSelectedZone(null);
      } else if (filter) setFilter(null);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------------------------------------------------------------- view helpers

  // On phones the details panel covers the lower half of the map, so the worker is
  // placed in the upper part of the view instead of the middle.
  function reveal(at: LatLng, zoom: number) {
    const map = mapRef.current;
    if (!map) return;
    const div = map.getDiv();
    const offset = div.clientWidth < 768 ? div.clientHeight * 0.25 : 0;
    if ((map.getZoom() ?? zoom) !== zoom) map.setZoom(zoom);
    map.panTo(shiftDown(map, at, offset, zoom));
  }

  function focusWorker(w: LiveWorker) {
    if (mode.kind !== "view") return;
    setSelectedZone(null);
    setSelectedWorker(w.employee_id);
    const map = mapRef.current;
    if (map && onMapIds.has(w.employee_id) && w.latitude !== null && w.longitude !== null) {
      reveal({ lat: w.latitude, lng: w.longitude }, Math.max(map.getZoom() ?? 0, FOCUS_ZOOM));
    }
  }

  // ---------------------------------------------------------------- search

  const searchNear = useCallback(() => mapRef.current?.getCenter() ?? null, []);

  function clearPlacePin() {
    placePinRef.current?.setMap(null);
    placePinRef.current = null;
  }

  function focusZone(z: Geofence) {
    const map = mapRef.current;
    if (!api || !map || mode.kind !== "view") return;
    clearPlacePin();
    setSelectedWorker(null);
    setSelectedZone(z.id);
    fitPoints(api, map, toPath(z.boundary), 96, 19);
  }

  async function focusPlace(hit: PlaceHit) {
    const map = mapRef.current;
    if (!api || !map) return;
    const at = await placeLocation(hit);
    if (!at) {
      toast.error(`Could not find “${hit.title}” on the map`);
      return;
    }
    clearPlacePin();
    setSelectedWorker(null);
    setSelectedZone(null);
    const el = document.createElement("div");
    el.className = "s14-place-pin";
    el.innerHTML = `<span class="s14-place-dot"></span><span class="s14-place-label">${escapeHtml(hit.title)}</span>`;
    placePinRef.current = htmlOverlay(api, { el, position: at, pane: "floatPane", map });
    if ((map.getZoom() ?? 0) < 17) map.setZoom(17);
    map.panTo(at);
  }

  function zoomBy(step: number) {
    const map = mapRef.current;
    if (map) map.setZoom((map.getZoom() ?? 16) + step);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else wrapperRef.current?.requestFullscreen().catch(() => undefined);
  }

  const worker = workers.find((w) => w.employee_id === selectedWorker) || null;
  const zone = selectedZone ? zones.find((z) => z.id === selectedZone) || null : null;
  const editingZone = mode.kind === "editing" ? zones.find((z) => z.id === mode.zoneId) || null : null;
  const viewing = mode.kind === "view";
  const loading = Boolean(siteId) && lastSync === null && !pollError;
  const rightPanel = Boolean((worker && viewing) || (zone && viewing) || mode.kind === "naming" || editingZone);
  const message = notice ?? (mapsError ? mapsError : !api ? "Loading map…" : null);

  return (
    <div
      ref={wrapperRef}
      className={`s14-map relative isolate h-[calc(100svh-6rem)] min-h-[480px] overflow-hidden rounded-card bg-[#1f1d1a] md:h-[calc(100svh-9rem)] ${
        fullscreen ? "rounded-none" : "shadow-sm ring-1 ring-black/5"
      } ${mode.kind === "drawing" ? "s14-drawing" : ""}`}
    >
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Everything floating over the map. The layer itself lets the map be dragged between panels. */}
      <div className="pointer-events-none absolute inset-0 z-[500]">
        {mode.kind === "drawing" ? (
          <div className="absolute inset-x-2 top-3 flex justify-center">
            <div className={`pointer-events-auto flex w-full max-w-xl flex-wrap items-center gap-3 rounded-2xl px-4 py-3 ${GLASS} animate-in fade-in slide-in-from-top-2`}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <PenLine className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {draftCount === 0 ? "Click the map to place the first corner" : `${draftCount} corner${draftCount === 1 ? "" : "s"} placed`}
                </p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  {draftCount >= 3 ? "Click the first corner or press Enter to finish · Esc to cancel" : "Draw inside the yellow site boundary · Esc to cancel"}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={undoPoint}
                  disabled={draftCount === 0}
                  title="Undo last corner (Backspace)"
                  aria-label="Undo last corner"
                  className="inline-flex size-9 items-center justify-center rounded-lg border bg-background transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <Undo2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={cancelZone}
                  aria-label="Cancel drawing"
                  title="Cancel (Esc)"
                  className="inline-flex size-9 items-center justify-center rounded-lg border bg-background transition-colors hover:bg-secondary"
                >
                  <X className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={finishDrawing}
                  disabled={draftCount < 3}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <Check className="size-4" />
                  Finish
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-2 md:inset-x-3 md:top-3">
            {siteSwitcher && <div className="pointer-events-auto">{siteSwitcher}</div>}
            <LivePill loading={loading} pollError={pollError} stale={stale} lastSync={lastSync} now={now} />
            {viewing && (
              <MapSearch
                workers={workers}
                onMapIds={onMapIds}
                zones={zones}
                near={searchNear}
                onWorker={(w) => {
                  clearPlacePin();
                  setFilter(null);
                  focusWorker(w);
                }}
                onZone={focusZone}
                onPlace={focusPlace}
                onClear={clearPlacePin}
              />
            )}

            <div className="order-last w-full md:order-none md:w-auto md:min-w-0 md:flex-1">
              <div className="pointer-events-auto -mr-2 flex max-w-full gap-1.5 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none] md:w-fit">
                {FILTER_STATUSES.filter((k) => counts[k] > 0 || k === "in_zone" || k === "out_of_zone").map((k) => {
                  const active = filter === k;
                  const s = STATUS[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(active ? null : k)}
                      title={`${s.hint}. Click to show only these.`}
                      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-semibold transition-all ${
                        active ? "text-white shadow-md" : `${GLASS} text-foreground hover:bg-card`
                      } ${filter && !active ? "opacity-60 hover:opacity-100" : ""}`}
                      style={active ? { background: s.color } : undefined}
                    >
                      <span className="size-2 rounded-full" style={{ background: active ? "#fff" : s.color }} />
                      {s.label}
                      <span
                        className={`min-w-5 rounded-full px-1.5 text-center text-[12px] tabular-nums ${active ? "bg-white/25" : ""}`}
                        style={active ? undefined : { color: s.color, background: s.bg }}
                      >
                        {counts[k]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {viewing && (
              <button
                type="button"
                onClick={startDrawing}
                disabled={!ready || !siteId}
                aria-label="Draw zone"
                className="pointer-events-auto ml-auto inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-2.5 sm:px-4 text-[13px] font-semibold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <PenLine className="size-4" />
                <span className="hidden sm:inline">Draw zone</span>
              </button>
            )}
          </div>
        )}

        {stale && (
          <div className="absolute top-16 left-1/2 w-max max-w-[92%] -translate-x-1/2 md:top-[4.5rem]">
            <div className="flex items-center gap-2 rounded-full bg-danger px-4 py-2 text-[13px] font-semibold text-white shadow-lg">
              <WifiOff className="size-4" />
              Connection lost. Positions are hidden until the map reconnects.
            </div>
          </div>
        )}

        {message && (
          <div className="absolute top-1/2 left-1/2 w-max max-w-[90%] -translate-x-1/2 -translate-y-1/2">
            <div className={`max-w-md rounded-2xl px-5 py-4 text-center text-sm font-semibold ${GLASS}`}>{message}</div>
          </div>
        )}

        {viewing && lastSync !== null && !stale && live.length === 0 && workers.length > 0 && !worker && !zone && (
          <div className="absolute bottom-[124px] left-1/2 w-max max-w-[90%] -translate-x-1/2 md:bottom-8">
            <div className={`rounded-full px-4 py-2 text-[13px] font-medium text-muted-foreground ${GLASS}`}>
              No one is live on the map right now
            </div>
          </div>
        )}

        {/* Bottom offsets keep Google's logo and terms (bottom corners) visible, as its terms require. */}
        <MapControls
          className={`absolute right-2 bottom-[124px] transition-[right] duration-200 md:bottom-8 ${rightPanel ? "md:right-[21.5rem]" : "md:right-3"}`}
          base={base}
          fullscreen={fullscreen}
          onZoomIn={() => zoomBy(1)}
          onZoomOut={() => zoomBy(-1)}
          onFit={() => fitSite()}
          onToggleBase={() => setBase((b) => (b === "satellite" ? "street" : "satellite"))}
          onToggleFullscreen={toggleFullscreen}
        />

        {viewing && siteId && (
          <RosterSheet
            workers={workers}
            onMapIds={onMapIds}
            filter={filter}
            selectedId={selectedWorker}
            now={now}
            onSelect={focusWorker}
            onHover={hoverWorker}
            onClearFilter={() => setFilter(null)}
          />
        )}

        {worker && viewing && (
          <WorkerPanel
            worker={worker}
            onMap={onMapIds.has(worker.employee_id)}
            now={now}
            onClose={() => setSelectedWorker(null)}
            onCenter={() => focusWorker(worker)}
          />
        )}

        {zone && viewing && !worker && (
          <ZoneCard
            zone={zone}
            workers={live.filter((w) => w.zone?.id === zone.id)}
            onSelectWorker={focusWorker}
            onEdit={() => {
              setSelectedZone(null);
              setZoneError(null);
              setMode({ kind: "editing", zoneId: zone.id });
            }}
            onClose={() => setSelectedZone(null)}
          />
        )}

        {(mode.kind === "naming" || editingZone) && (
          <ZonePanel
            zone={editingZone}
            saving={saving}
            error={zoneError}
            onSave={saveZone}
            onDeactivate={editingZone ? removeZone : undefined}
            onCancel={cancelZone}
          />
        )}
      </div>
    </div>
  );
}

function LivePill({
  loading,
  pollError,
  stale,
  lastSync,
  now,
}: {
  loading: boolean;
  pollError: string | null;
  stale: boolean;
  lastSync: number | null;
  now: number;
}) {
  let dot = "bg-ok";
  let text: ReactNode;
  if (loading) {
    text = (
      <>
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> Connecting…
      </>
    );
  } else if (stale) {
    dot = "bg-danger";
    text = "Offline";
  } else if (pollError) {
    dot = "bg-warn";
    text = "Reconnecting…";
  } else {
    // Phones show just the green dot when all is well, so the top bar fits on one row.
    text = (
      <>
        <span className="sr-only sm:not-sr-only">Live</span>
        <span className="hidden font-normal text-muted-foreground sm:inline">
          · {lastSync ? (ago(new Date(lastSync).toISOString(), now) ?? "now") : "now"}
        </span>
      </>
    );
  }
  return (
    <div
      role="status"
      title={pollError ? `Live positions: ${pollError}` : "Positions refresh every few seconds"}
      className={`pointer-events-auto inline-flex h-9 min-w-9 items-center justify-center gap-2 rounded-full px-3 text-[13px] font-semibold sm:px-3.5 ${GLASS}`}
    >
      {!loading && <span className={`size-2 rounded-full ${dot} ${!pollError && !stale ? "s14-live-dot" : ""}`} />}
      {text}
    </div>
  );
}
