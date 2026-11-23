import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Eraser,
  Maximize2,
  MousePointerClick,
  Undo2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MapTypeToggle from "@/shared/components/MapTypeToggle";
import type { LatLng } from "@/features/map/types";
import {
  MAP_STYLES,
  SATELLITE,
  fitPoints,
  useGoogleMaps,
} from "@/shared/lib/googleMaps";
import {
  addCorner,
  areaM2,
  formatArea,
  formatLength,
  orderAroundCentre,
  perimeterM,
  selfIntersects,
} from "../geometry";
import PlaceSearch from "./PlaceSearch";

const FALLBACK_CENTER: LatLng = { lat: 24.7136, lng: 46.6753 };
const MAX_UNDO = 50;

type Props = {
  corners: LatLng[];
  onChange: (corners: LatLng[]) => void;
  invalid?: boolean;
  className?: string;
};

const pathOf = (poly: google.maps.Polygon): LatLng[] =>
  poly
    .getPath()
    .getArray()
    .map((p) => ({ lat: p.lat(), lng: p.lng() }));

const samePath = (a: LatLng[], b: LatLng[]) =>
  a.length === b.length &&
  a.every((p, i) => p.lat === b[i].lat && p.lng === b[i].lng);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

// The site perimeter, drawn on the map: click to add a corner (in any order: each goes where it keeps
// the outline from crossing itself), drag a corner to move it, drag the dot in the middle of an edge
// to add a corner there, click a corner to remove it.
export default function BoundaryPicker({
  corners,
  onChange,
  invalid,
  className = "h-[420px]",
}: Props) {
  const { api, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const shapeRef = useRef<google.maps.Polygon | null>(null);
  const haloRef = useRef<google.maps.Polyline | null>(null);
  const pathListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const historyRef = useRef<LatLng[][]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // The map's listeners are bound once; they read the latest props through these.
  const cornersRef = useRef(corners);
  cornersRef.current = corners;
  const changeRef = useRef((next: LatLng[]) => {
    void next;
  });
  changeRef.current = (next: LatLng[]) => {
    if (samePath(next, cornersRef.current)) return;
    historyRef.current = [...historyRef.current, cornersRef.current].slice(
      -MAX_UNDO,
    );
    setCanUndo(true);
    onChange(next);
  };

  useEffect(() => {
    if (!api || !containerRef.current) return;
    const map = new api.Map(containerRef.current, {
      center: FALLBACK_CENTER,
      zoom: 16,
      mapTypeId: SATELLITE,
      styles: MAP_STYLES,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      disableDoubleClickZoom: true,
      tilt: 0,
      draggableCursor: "crosshair",
    });

    // Same look as the site perimeter on the live map: a white halo under a bright outline.
    haloRef.current = new api.Polyline({
      map,
      strokeColor: "#FFFFFF",
      strokeWeight: 7,
      strokeOpacity: 0.8,
      clickable: false,
      zIndex: 1,
    });
    const shape = new api.Polygon({
      map,
      strokeColor: "#FACC15",
      strokeWeight: 3,
      fillColor: "#FACC15",
      fillOpacity: 0.15,
      editable: true,
      zIndex: 2,
    });
    shapeRef.current = shape;

    const add = (e: google.maps.MapMouseEvent) => {
      if (e.latLng)
        changeRef.current(addCorner(cornersRef.current, e.latLng.toJSON()));
    };
    map.addListener("click", add);
    shape.addListener("click", (e: google.maps.PolyMouseEvent) => {
      // A click on a corner removes it; anywhere else inside the shape adds one, as on the map.
      if (e.vertex !== undefined)
        changeRef.current(cornersRef.current.filter((_, i) => i !== e.vertex));
      else if (e.edge === undefined) add(e);
    });

    // An existing site opens on its perimeter.
    fitPoints(api, map, cornersRef.current, 48, 18);
    setMap(map);

    return () => {
      pathListenersRef.current.forEach((l) => l?.remove());
      pathListenersRef.current = [];
      api.event.clearInstanceListeners(map);
      setMap(null);
      shape.setMap(null);
      haloRef.current?.setMap(null);
      shapeRef.current = null;
      haloRef.current = null;
    };
  }, [api]);

  const crossing = selfIntersects(corners);

  useEffect(() => {
    const shape = shapeRef.current;
    const halo = haloRef.current;
    if (!shape || !halo) return;
    pathListenersRef.current.forEach((l) => l?.remove());
    shape.setPath(corners);
    halo.setPath(corners.length >= 3 ? [...corners, corners[0]] : corners);
    // A crossing outline turns red until it is fixed.
    const colour = crossing ? "#EF4444" : "#FACC15";
    shape.setOptions({ strokeColor: colour, fillColor: colour });
    // Google moves the corners itself when they are dragged; report the new shape back.
    const changed = () => changeRef.current(pathOf(shape));
    const path = shape.getPath();
    pathListenersRef.current = [
      path.addListener("set_at", changed),
      path.addListener("insert_at", changed),
      path.addListener("remove_at", changed),
    ];
  }, [api, corners, crossing]);

  function goTo(at: LatLng) {
    if (!map) return;
    map.panTo(at);
    if ((map.getZoom() ?? 0) < 18) map.setZoom(18);
  }

  function undo() {
    const previous = historyRef.current.pop();
    setCanUndo(historyRef.current.length > 0);
    if (previous) onChange(previous);
  }

  function fit() {
    if (api && map) fitPoints(api, map, corners, 48, 19);
  }

  const area = areaM2(corners);
  const closed = corners.length >= 3;

  return (
    <div className="grid gap-3">
      <div
        className={`@container relative w-full overflow-hidden rounded-lg border border-input bg-muted aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 ${className}`}
        aria-invalid={invalid || crossing}
      >
        <div
          ref={containerRef}
          className="absolute inset-0"
          aria-label="Site boundary map"
        />
        <MapTypeToggle map={map} />
        {map && (
          <PlaceSearch
            map={map}
            onPick={goTo}
            className="top-12 right-2 left-2 @md:top-2 @md:left-auto @md:w-72"
          />
        )}

        {map && corners.length < 3 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <p className="flex items-center gap-2 rounded-full bg-background/95 px-4 py-2 text-xs font-medium shadow-md">
              <MousePointerClick className="size-4 shrink-0 text-primary" />
              {corners.length === 0
                ? "Find the site, then click its corners on the map"
                : `${3 - corners.length} more corner${corners.length === 2 ? "" : "s"} to close the shape`}
            </p>
          </div>
        )}

        {(error || !api) && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {error ?? "Loading map…"}
          </p>
        )}
      </div>

      {crossing && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md bg-danger-bg px-4 py-3 text-sm text-danger"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 font-medium">
            The outline crosses itself, so it has no clear inside.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="bg-background"
            onClick={() => changeRef.current(orderAroundCentre(corners))}
          >
            <Wand2 />
            Fix shape
          </Button>
        </div>
      )}

      <div className="@container rounded-lg border bg-secondary/40 px-4 py-3">
        <div className="flex flex-col gap-3 @xl:flex-row @xl:items-center">
          <dl className="grid grid-cols-3 gap-4 @xl:mr-auto @xl:gap-6">
            <Stat label="Corners" value={String(corners.length)} />
            <Stat
              label="Area"
              value={closed && !crossing ? formatArea(area) : "—"}
            />
            <Stat
              label="Perimeter"
              value={
                closed && !crossing ? formatLength(perimeterM(corners)) : "—"
              }
            />
          </dl>
          <div className="grid grid-cols-3 gap-2 @xl:flex">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!closed || !map}
              onClick={fit}
              title="Zoom to the boundary"
            >
              <Maximize2 />
              Fit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canUndo}
              onClick={undo}
            >
              <Undo2 />
              Undo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!corners.length}
              onClick={() => changeRef.current([])}
            >
              <Eraser />
              Clear
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
