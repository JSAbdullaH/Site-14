import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import MapTypeToggle from "@/shared/components/MapTypeToggle";
import type { LatLng } from "@/features/map/types";
import { MAP_STYLES, SATELLITE, fitPoints, useGoogleMaps } from "@/shared/lib/googleMaps";
import PlaceSearch from "./PlaceSearch";

const FALLBACK_CENTER: LatLng = { lat: 24.7136, lng: 46.6753 };

type Props = {
  corners: LatLng[];
  onChange: (corners: LatLng[]) => void;
  invalid?: boolean;
};

const pathOf = (poly: google.maps.Polygon): LatLng[] =>
  poly
    .getPath()
    .getArray()
    .map((p) => ({ lat: p.lat(), lng: p.lng() }));

// The site perimeter, drawn on the map: click to add a corner, drag a corner to move it,
// drag the dot in the middle of an edge to add a corner there, click a corner to remove it.
export default function BoundaryPicker({ corners, onChange, invalid }: Props) {
  const { api, error } = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const shapeRef = useRef<google.maps.Polygon | null>(null);
  const haloRef = useRef<google.maps.Polyline | null>(null);
  const pathListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  // The map's listeners are bound once; they read the latest props through these.
  const cornersRef = useRef(corners);
  const onChangeRef = useRef(onChange);
  cornersRef.current = corners;
  onChangeRef.current = onChange;

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
    haloRef.current = new api.Polyline({ map, strokeColor: "#FFFFFF", strokeWeight: 7, strokeOpacity: 0.8, clickable: false, zIndex: 1 });
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
      if (e.latLng) onChangeRef.current([...cornersRef.current, e.latLng.toJSON()]);
    };
    map.addListener("click", add);
    shape.addListener("click", (e: google.maps.PolyMouseEvent) => {
      // A click on a corner removes it; anywhere else inside the shape adds one, as on the map.
      if (e.vertex !== undefined) onChangeRef.current(cornersRef.current.filter((_, i) => i !== e.vertex));
      else if (e.edge === undefined) add(e);
    });

    // An existing site opens on its perimeter.
    fitPoints(api, map, cornersRef.current, 32, 18);
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

  useEffect(() => {
    const shape = shapeRef.current;
    const halo = haloRef.current;
    if (!shape || !halo) return;
    pathListenersRef.current.forEach((l) => l?.remove());
    shape.setPath(corners);
    halo.setPath(corners.length >= 3 ? [...corners, corners[0]] : corners);
    // Google moves the corners itself when they are dragged; report the new shape back.
    const changed = () => onChangeRef.current(pathOf(shape));
    const path = shape.getPath();
    pathListenersRef.current = [
      path.addListener("set_at", changed),
      path.addListener("insert_at", changed),
      path.addListener("remove_at", changed),
    ];
  }, [api, corners]);

  function goTo(at: LatLng) {
    if (!map) return;
    map.panTo(at);
    if ((map.getZoom() ?? 0) < 18) map.setZoom(18);
  }

  return (
    <div className="grid gap-2">
      <div className="relative h-80 w-full overflow-hidden rounded-lg border border-input bg-muted aria-invalid:border-destructive" aria-invalid={invalid}>
        <div ref={containerRef} className="absolute inset-0" />
        <MapTypeToggle map={map} />
        {map && <PlaceSearch map={map} onPick={goTo} />}
        {(error || !api) && (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {error ?? "Loading map…"}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-muted-foreground tabular-nums">
          {corners.length} corner{corners.length === 1 ? "" : "s"}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!corners.length}
          onClick={() => onChange(corners.slice(0, -1))}
        >
          Undo last
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!corners.length} onClick={() => onChange([])}>
          Clear
        </Button>
      </div>
    </div>
  );
}
