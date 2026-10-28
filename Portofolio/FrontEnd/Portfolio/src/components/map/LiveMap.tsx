import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  createZone,
  deactivateZone,
  getLive,
  listZones,
  toPath,
  toPolygon,
  updateZone,
  type Geofence,
  type LatLng,
  type Polygon,
  type LiveWorker,
} from "../../lib/mapApi";
import { STATUS } from "./status";
import WorkerPanel from "./WorkerPanel";
import ZonePanel from "./ZonePanel";

const POLL_MS = 7000;

const FALLBACK_CENTER: LatLng = { lat: 24.7136, lng: 46.6753 };

type Mode =
  | { kind: "view" }
  | { kind: "drawing" }
  | { kind: "naming"; path: LatLng[] }
  | { kind: "editing"; zoneId: string };

type MarkerEntry = { marker: L.Marker; key: string };

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function workerIcon(w: LiveWorker) {
  const s = STATUS[w.location_status];
  const name = escape(w.full_name.split(" ")[0]);
  return L.divIcon({
    className: "",
    iconAnchor: [8, 12],
    html:
      `<div style="display:inline-flex;align-items:center;gap:6px;padding:3px 8px 3px 4px;border-radius:999px;` +
      `background:#FDF9F2;border:2px solid ${s.color};font:700 12px system-ui;color:#1C1C1C;` +
      `box-shadow:0 1px 4px rgba(0,0,0,.25);white-space:nowrap;cursor:pointer">` +
      `<span style="width:10px;height:10px;border-radius:50%;background:${s.color}"></span>` +
      `<span>${name} · ${s.label}</span></div>`,
  });
}

const vertexIcon = L.divIcon({
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #DB4406;cursor:move"></div>',
});

const zoneStyle = (z: Geofence, selected: boolean): L.PathOptions => ({
  color: z.is_outdoor ? "#DB4406" : "#4F7A5B",
  weight: selected ? 3 : 2,
  fillColor: z.is_outdoor ? "#DB4406" : "#4F7A5B",
  fillOpacity: selected ? 0.25 : 0.12,
});

type Props = { siteId: string | null; notice?: string | null };

export default function LiveMap({ siteId, notice }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const polygonsRef = useRef(new Map<string, L.Polygon>());
  const draftRef = useRef<L.Polyline | null>(null);
  const handlesRef = useRef<L.LayerGroup | null>(null);
  const siteLayerRef = useRef<L.Polygon | null>(null);
  const editPathRef = useRef<LatLng[]>([]);
  const fittedRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [workers, setWorkers] = useState<LiveWorker[]>([]);
  const [zones, setZones] = useState<Geofence[]>([]);
  const [siteBoundary, setSiteBoundary] = useState<Polygon | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [draftCount, setDraftCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { center: FALLBACK_CENTER, zoom: 16 });
    const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Tiles &copy; Esri" },
    );
    satellite.addTo(map);
    L.control.layers({ Satellite: satellite, Street: street }).addTo(map);
    map.on("click", (e: L.LeafletMouseEvent) => {
      if (modeRef.current.kind !== "drawing" || !draftRef.current) return;
      draftRef.current.addLatLng(e.latlng);
      setDraftCount((draftRef.current.getLatLngs() as L.LatLng[]).length);
    });
    mapRef.current = map;
    setReady(true);
    return () => {
      map.remove();
      siteLayerRef.current = null;
      mapRef.current = null;
      markersRef.current.clear();
      polygonsRef.current.clear();
    };
  }, []);

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
    setMode({ kind: "view" });
    refreshZones().catch((err: Error) => setZoneError(`Zones: ${err.message}`));
  }, [refreshZones]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const polygons = polygonsRef.current;
    const editingId = mode.kind === "editing" ? mode.zoneId : null;
    const seen = new Set<string>();
    for (const z of zones) {
      seen.add(z.id);
      let poly = polygons.get(z.id);
      if (!poly) {
        poly = L.polygon(toPath(z.boundary)).addTo(map);
        poly.on("click", () => {
          const current = modeRef.current.kind;
          if (current === "view" || current === "editing") {
            setSelectedWorker(null);
            setZoneError(null);
            setMode({ kind: "editing", zoneId: z.id });
          }
        });
        polygons.set(z.id, poly);
      } else if (z.id !== editingId) {
        poly.setLatLngs(toPath(z.boundary));
      }
      poly.setStyle(zoneStyle(z, z.id === editingId));
    }
    for (const [id, poly] of polygons) {
      if (!seen.has(id)) {
        poly.remove();
        polygons.delete(id);
      }
    }
  }, [ready, zones, mode]);

  useEffect(() => {
    const map = mapRef.current;
    handlesRef.current?.remove();
    handlesRef.current = null;
    if (!map || mode.kind !== "editing") return;
    const zone = zones.find((z) => z.id === mode.zoneId);
    const poly = polygonsRef.current.get(mode.zoneId);
    if (!zone || !poly) return;
    editPathRef.current = toPath(zone.boundary);
    poly.setLatLngs(editPathRef.current);
    const group = L.layerGroup().addTo(map);
    editPathRef.current.forEach((point, i) => {
      L.marker(point, { icon: vertexIcon, draggable: true })
        .on("drag", (e) => {
          const { lat, lng } = (e.target as L.Marker).getLatLng();
          editPathRef.current[i] = { lat, lng };
          poly.setLatLngs(editPathRef.current);
        })
        .addTo(group);
    });
    handlesRef.current = group;
  }, [mode, zones]);

  useEffect(() => {
    if (!siteId) return;
    const id = siteId;
    let stopped = false;
    async function tick() {
      if (document.hidden) return;
      try {
        const res = await getLive(id);
        if (!stopped) {
          setWorkers(res.data);
          setSiteBoundary(res.site.boundary);
          setPollError(null);
        }
      } catch (err) {
        if (!stopped) setPollError((err as Error).message);
      }
    }
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [siteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const markers = markersRef.current;
    const seen = new Set<string>();
    for (const w of workers) {
      seen.add(w.employee_id);
      const key = `${w.latitude},${w.longitude},${w.location_status},${w.full_name}`;
      const entry = markers.get(w.employee_id);
      if (entry && entry.key === key) continue;
      if (entry) {
        entry.marker.setLatLng([w.latitude, w.longitude]);
        entry.marker.setIcon(workerIcon(w));
        entry.key = key;
      } else {
        const marker = L.marker([w.latitude, w.longitude], { icon: workerIcon(w), title: w.full_name })
          .on("click", () => {
            if (modeRef.current.kind === "view") setSelectedWorker(w.employee_id);
          })
          .addTo(map);
        markers.set(w.employee_id, { marker, key });
      }
    }
    for (const [id, entry] of markers) {
      if (!seen.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    }
  }, [ready, workers]);

  useEffect(() => {
    const map = mapRef.current;
    siteLayerRef.current?.remove();
    siteLayerRef.current = null;
    if (!ready || !map || !siteBoundary) return;
    siteLayerRef.current = L.polygon(toPath(siteBoundary), {
      color: "#1C1C1C",
      weight: 2,
      dashArray: "6 6",
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(map);
    siteLayerRef.current.bringToBack();
  }, [ready, siteBoundary]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || fittedRef.current === siteId) return;
    const points: LatLng[] = [
      ...(siteBoundary ? toPath(siteBoundary) : []),
      ...zones.flatMap((z) => toPath(z.boundary)),
      ...workers.filter((w) => w.location_status !== "off_site").map((w) => ({ lat: w.latitude, lng: w.longitude })),
    ];
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 18 });
    fittedRef.current = siteId;
  }, [ready, siteId, siteBoundary, zones, workers]);

  function startDrawing() {
    const map = mapRef.current;
    if (!map) return;
    setSelectedWorker(null);
    setZoneError(null);
    draftRef.current?.remove();
    draftRef.current = L.polyline([], { color: "#DB4406", weight: 2, interactive: false }).addTo(map);
    setDraftCount(0);
    setMode({ kind: "drawing" });
  }

  function clearDraft() {
    draftRef.current?.remove();
    draftRef.current = null;
    setDraftCount(0);
  }

  function finishDrawing() {
    if (!draftRef.current) return;
    const path = (draftRef.current.getLatLngs() as L.LatLng[]).map(({ lat, lng }) => ({ lat, lng }));
    if (path.length < 3) return;
    draftRef.current.setLatLngs([...path, path[0]]);
    setMode({ kind: "naming", path });
  }

  function cancelZone() {
    if (mode.kind === "editing") {
      const z = zones.find((x) => x.id === mode.zoneId);
      const poly = polygonsRef.current.get(mode.zoneId);
      if (z && poly) poly.setLatLngs(toPath(z.boundary));
    }
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
      } else if (mode.kind === "editing") {
        const path = editPathRef.current;
        await updateZone(mode.zoneId, { ...values, ...(path.length >= 3 ? { boundary: toPolygon(path) } : {}) });
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
    } catch (err) {
      setZoneError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const worker = workers.find((w) => w.employee_id === selectedWorker) || null;
  const editingZone = mode.kind === "editing" ? zones.find((z) => z.id === mode.zoneId) || null : null;
  const counts = workers.reduce(
    (acc, w) => ({ ...acc, [w.location_status]: acc[w.location_status] + 1 }),
    { in_zone: 0, on_site: 0, off_site: 0 },
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex flex-wrap items-center gap-3">
        {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-full text-[13px] font-bold"
            style={{ color: STATUS[k].color, background: STATUS[k].bg }}
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS[k].color }} />
            {STATUS[k].label} · {counts[k]}
          </span>
        ))}
        <div className="ml-auto flex gap-2">
          {mode.kind === "drawing" ? (
            <>
              <span className="self-center text-[13px] text-muted font-semibold">
                Click the map to add corners ({draftCount})
              </span>
              <button
                onClick={finishDrawing}
                disabled={draftCount < 3}
                className="h-10 px-4 rounded-ctrl bg-signal text-white font-bold disabled:opacity-55"
              >
                Finish
              </button>
              <button onClick={cancelZone} className="h-10 px-4 rounded-ctrl font-bold hover:bg-sand">
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={startDrawing}
              disabled={!ready || !siteId || mode.kind !== "view"}
              className="h-10 px-4 rounded-ctrl bg-ink text-white font-bold disabled:opacity-55"
            >
              Draw zone
            </button>
          )}
        </div>
      </div>

      {pollError && <p className="text-[13px] text-signal font-semibold">Live positions: {pollError}</p>}
      {zoneError && mode.kind === "view" && <p className="text-[13px] text-signal font-semibold">{zoneError}</p>}

      <div
        className={`relative flex-1 min-h-[480px] rounded-card overflow-hidden bg-sand ${
          mode.kind === "drawing" ? "[&_.leaflet-container]:cursor-crosshair" : ""
        }`}
      >
        <div ref={containerRef} className="absolute inset-0 z-0" />
        {notice && (
          <div className="absolute z-10 top-4 left-1/2 -translate-x-1/2 max-w-[90%] bg-page shadow-lg rounded-card px-4 py-3 text-sm font-bold text-center">
            {notice}
          </div>
        )}
        {worker && mode.kind === "view" && <WorkerPanel worker={worker} onClose={() => setSelectedWorker(null)} />}
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
