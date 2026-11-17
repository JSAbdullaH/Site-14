import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import EmptyState from "@/shared/components/EmptyState";
import { Button } from "@/components/ui/button";
import MapTypeToggle from "@/shared/components/MapTypeToggle";
import { toPath } from "@/features/map/api";
import type { MovementHistory } from "../types";
import { clock, formatMinutes } from "../format";
import { MAP_STYLES, SATELLITE, dashed, fitPoints, hoverTip, htmlOverlay, useGoogleMaps, type HtmlOverlay } from "@/shared/lib/googleMaps";

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

export default function PathReplay({ history }: Props) {
  const { api, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const trailRef = useRef<google.maps.Polyline | null>(null);
  const markerRef = useRef<HtmlOverlay | null>(null);
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
    if (!api || !containerRef.current || steps.length === 0) return;
    const map = new api.Map(containerRef.current, {
      center: { lat: steps[0].lat, lng: steps[0].lng },
      zoom: 17,
      mapTypeId: SATELLITE,
      styles: MAP_STYLES,
      mapTypeControl: false,
      streetViewControl: false,
      clickableIcons: false,
      tilt: 0,
    });
    const shapes: (google.maps.Polygon | google.maps.Polyline)[] = [];
    const untips: (() => void)[] = [];

    for (const site of history.sites) {
      shapes.push(
        new api.Polygon({ map, paths: toPath(site.boundary), strokeColor: "#FACC15", strokeWeight: 3, fillColor: "#FACC15", fillOpacity: 0.06, clickable: false }),
      );
    }
    for (const z of history.zones) {
      const color = z.is_outdoor ? "#DB4406" : "#4F7A5B";
      const poly = new api.Polygon({ map, paths: toPath(z.boundary), strokeColor: color, strokeWeight: 2, fillColor: color, fillOpacity: 0.12 });
      shapes.push(poly);
      untips.push(hoverTip(api, map, poly, z.name));
    }

    const line = (path: google.maps.LatLngLiteral[]) =>
      shapes.push(new api.Polyline({ map, path, strokeColor: "#FFFFFF", strokeWeight: 2, strokeOpacity: 0.55, clickable: false, zIndex: 3 }));
    for (const s of history.sessions) {
      let run: google.maps.LatLngLiteral[] = [];
      s.points.forEach((p, i) => {
        run.push({ lat: p.latitude, lng: p.longitude });
        const gap = s.gaps.find((g) => g.from === p.recorded_at && !g.until_end);
        const next = s.points[i + 1];
        if (gap && next) {
          line(run);
          shapes.push(
            new api.Polyline({
              map,
              path: [
                { lat: p.latitude, lng: p.longitude },
                { lat: next.latitude, lng: next.longitude },
              ],
              ...dashed("#F5B700"),
              clickable: false,
              zIndex: 3,
            }),
          );
          run = [];
        }
      });
      if (run.length) line(run);
    }

    trailRef.current = new api.Polyline({ map, strokeColor: "#DB4406", strokeWeight: 4, clickable: false, zIndex: 4 });
    const dot = document.createElement("div");
    dot.className = "gm-dot";
    markerRef.current = htmlOverlay(api, { el: dot, position: { lat: steps[0].lat, lng: steps[0].lng }, pane: "floatPane", map });
    fitPoints(api, map, steps, 40, 18);
    mapRef.current = map;
    setMap(map);

    return () => {
      untips.forEach((fn) => fn());
      shapes.forEach((s) => s.setMap(null));
      trailRef.current?.setMap(null);
      markerRef.current?.setMap(null);
      api.event.clearInstanceListeners(map);
      setMap(null);
      mapRef.current = null;
      trailRef.current = null;
      markerRef.current = null;
    };
  }, [api, history, steps]);

  useEffect(() => {
    const step = steps[index];
    if (!step || !markerRef.current || !trailRef.current) return;
    const at = { lat: step.lat, lng: step.lng };
    markerRef.current.setPosition(at);
    trailRef.current.setPath(steps.slice(0, index + 1).map((s) => ({ lat: s.lat, lng: s.lng })));
    // Follow the marker once it gets near the edge of the view.
    const bounds = mapRef.current?.getBounds();
    if (bounds) {
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const padLat = (ne.lat() - sw.lat()) * 0.1;
      const padLng = (ne.lng() - sw.lng()) * 0.1;
      const inside =
        at.lat < ne.lat() - padLat && at.lat > sw.lat() + padLat && at.lng < ne.lng() - padLng && at.lng > sw.lng() + padLng;
      if (!inside) mapRef.current?.panTo(at);
    }
  }, [api, index, steps]);

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
      <div className="relative h-[460px] w-full overflow-hidden rounded-lg border bg-muted">
        <div ref={containerRef} className="absolute inset-0" />
        <MapTypeToggle map={map} />
        {(error || !api) && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {error ?? "Loading map…"}
          </p>
        )}
      </div>

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
