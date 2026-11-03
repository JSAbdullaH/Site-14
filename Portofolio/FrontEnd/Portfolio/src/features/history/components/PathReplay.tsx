import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Pause, Play, RotateCcw } from "lucide-react";
import EmptyState from "@/shared/components/EmptyState";
import { Button } from "@/components/ui/button";
import { toPath } from "@/features/map/api";
import type { MovementHistory } from "../types";
import { clock, formatMinutes } from "../format";

type Props = { history: MovementHistory };

type Step = {
  lat: number;
  lng: number;
  at: string;
  zone: string | null;
  site: string;
  gapAfter: number | null;
};

const SPEEDS = [
  { label: "1x", ms: 600 },
  { label: "4x", ms: 150 },
  { label: "10x", ms: 60 },
];

const markerIcon = L.divIcon({
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#DB4406;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)"></div>',
});

export default function PathReplay({ history }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trailRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1]);

  const steps = useMemo<Step[]>(() => {
    const zoneName = new Map(history.zones.map((z) => [z.id, z.name]));
    return history.sessions.flatMap((s) =>
      s.points.map((p) => ({
        lat: p.latitude,
        lng: p.longitude,
        at: p.recorded_at,
        zone: p.zone_id ? zoneName.get(p.zone_id) ?? null : null,
        site: s.site.name,
        gapAfter: s.gaps.find((g) => g.from === p.recorded_at)?.minutes ?? null,
      })),
    );
  }, [history]);

  useEffect(() => {
    if (!containerRef.current || steps.length === 0) return;
    const map = L.map(containerRef.current, { zoomControl: true });
    const satellite = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Tiles &copy; Esri" },
    );
    const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    satellite.addTo(map);
    L.control.layers({ Satellite: satellite, Street: street }).addTo(map);

    for (const site of history.sites) {
      L.polygon(toPath(site.boundary), { color: "#FACC15", weight: 3, fillOpacity: 0.06, interactive: false }).addTo(map);
    }
    for (const z of history.zones) {
      const color = z.is_outdoor ? "#DB4406" : "#4F7A5B";
      L.polygon(toPath(z.boundary), { color, weight: 2, fillColor: color, fillOpacity: 0.12 })
        .bindTooltip(z.name, { sticky: true })
        .addTo(map);
    }

    for (const s of history.sessions) {
      let run: L.LatLngExpression[] = [];
      s.points.forEach((p, i) => {
        run.push([p.latitude, p.longitude]);
        const gap = s.gaps.find((g) => g.from === p.recorded_at && !g.until_end);
        const next = s.points[i + 1];
        if (gap && next) {
          L.polyline(run, { color: "#FFFFFF", weight: 2, opacity: 0.55, interactive: false }).addTo(map);
          L.polyline([[p.latitude, p.longitude], [next.latitude, next.longitude]], {
            color: "#F5B700",
            weight: 2,
            dashArray: "6 6",
            interactive: false,
          }).addTo(map);
          run = [];
        }
      });
      if (run.length) L.polyline(run, { color: "#FFFFFF", weight: 2, opacity: 0.55, interactive: false }).addTo(map);
    }

    trailRef.current = L.polyline([], { color: "#DB4406", weight: 4, interactive: false }).addTo(map);
    markerRef.current = L.marker([steps[0].lat, steps[0].lng], { icon: markerIcon, keyboard: false }).addTo(map);
    map.fitBounds(L.latLngBounds(steps.map((s) => [s.lat, s.lng] as L.LatLngTuple)), { padding: [40, 40], maxZoom: 18 });
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      trailRef.current = null;
      markerRef.current = null;
    };
  }, [history, steps]);

  useEffect(() => {
    const step = steps[index];
    if (!step || !markerRef.current || !trailRef.current) return;
    markerRef.current.setLatLng([step.lat, step.lng]);
    trailRef.current.setLatLngs(steps.slice(0, index + 1).map((s) => [s.lat, s.lng] as L.LatLngTuple));
    const map = mapRef.current;
    if (map && !map.getBounds().pad(-0.1).contains([step.lat, step.lng])) map.panTo([step.lat, step.lng]);
  }, [index, steps]);

  useEffect(() => {
    // Play button: moves index every speed.ms
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((i) => {
        if (i >= steps.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, speed.ms);
    return () => window.clearInterval(timer);
  }, [playing, speed, steps.length]);

  if (steps.length === 0) {
    return (
      <EmptyState
        title="Nothing to replay"
        description="The device sent no positions for this worker on the chosen day."
      />
    );
  }

  const step = steps[index];
  const atEnd = index >= steps.length - 1;

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="h-[460px] w-full overflow-hidden rounded-lg border" />

      <div className="rounded-lg border bg-background px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Play / Pause -> setPlaying() */}
          <Button
            size="sm"
            onClick={() => {
              if (atEnd) setIndex(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? <Pause /> : atEnd ? <RotateCcw /> : <Play />}
            {playing ? "Pause" : atEnd ? "Replay" : "Play"}
          </Button>
          <div className="flex gap-1">
            {/* 1x 4x 10x -> setSpeed() */}
            {SPEEDS.map((s) => (
              <Button
                key={s.label}
                size="sm"
                variant={s.label === speed.label ? "secondary" : "ghost"}
                onClick={() => setSpeed(s)}
              >
                {s.label}
              </Button>
            ))}
          </div>
          <div className="ml-auto text-right text-sm">
            <span className="text-lg font-semibold tabular-nums">{clock(step.at)}</span>
            <span className="ml-2 text-muted-foreground">
              {step.zone ?? `${step.site}, outside any zone`}
            </span>
          </div>
        </div>

        {/* timeline slider -> setIndex() */}
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
          aria-label="Replay position"
          className="mt-4 w-full accent-[#DB4406]"
        />
        <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
          <span>{clock(steps[0].at)}</span>
          <span>
            Position {index + 1} of {steps.length}
          </span>
          <span>{clock(steps[steps.length - 1].at)}</span>
        </div>

        {step.gapAfter !== null && (
          <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm font-medium text-warn">
            After this point the device stopped reporting for {formatMinutes(step.gapAfter)}. The dashed line is a
            jump, not a route.
          </p>
        )}
      </div>
    </div>
  );
}
