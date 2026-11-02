import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import type { LatLng } from "@/features/map/types";

const FALLBACK_CENTER: LatLng = { lat: 24.7136, lng: 46.6753 };

const cornerIcon = L.divIcon({
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #DB4406;cursor:move"></div>',
});

type Props = {
  corners: LatLng[];
  onChange: (corners: LatLng[]) => void;
  invalid?: boolean;
};

// The site perimeter, drawn on the map: click to add a corner, drag a corner to move it,
// click a corner to remove it.
export default function BoundaryPicker({ corners, onChange, invalid }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shapeRef = useRef<L.Polygon | null>(null);
  const haloRef = useRef<L.Polygon | null>(null);
  const handlesRef = useRef<L.LayerGroup | null>(null);
  // The map's listeners are bound once; they read the latest props through these.
  const cornersRef = useRef(corners);
  const onChangeRef = useRef(onChange);
  cornersRef.current = corners;
  onChangeRef.current = onChange;

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

    // Same look as the site perimeter on the live map: a white halo under a bright outline.
    haloRef.current = L.polygon([], { color: "#FFFFFF", weight: 7, opacity: 0.8, fill: false, interactive: false }).addTo(map);
    shapeRef.current = L.polygon([], {
      color: "#FACC15",
      weight: 3,
      fillColor: "#FACC15",
      fillOpacity: 0.15,
      interactive: false,
    }).addTo(map);
    handlesRef.current = L.layerGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current([...cornersRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    });

    // An existing site opens on its perimeter.
    if (cornersRef.current.length) {
      map.fitBounds(L.latLngBounds(cornersRef.current), { padding: [32, 32], maxZoom: 18 });
    }

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      shapeRef.current = null;
      haloRef.current = null;
      handlesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const shape = shapeRef.current;
    const halo = haloRef.current;
    const handles = handlesRef.current;
    if (!shape || !halo || !handles) return;
    shape.setLatLngs(corners);
    halo.setLatLngs(corners);
    handles.clearLayers();
    corners.forEach((point, i) => {
      L.marker(point, { icon: cornerIcon, draggable: true, title: `Corner ${i + 1}` })
        .on("drag", (e) => {
          const moved = [...corners];
          moved[i] = (e.target as L.Marker).getLatLng();
          shape.setLatLngs(moved);
          halo.setLatLngs(moved);
        })
        .on("dragend", (e) => {
          const { lat, lng } = (e.target as L.Marker).getLatLng();
          onChangeRef.current(corners.map((p, j) => (j === i ? { lat, lng } : p)));
        })
        .on("click", () => onChangeRef.current(corners.filter((_, j) => j !== i)))
        .addTo(handles);
    });
  }, [corners]);

  return (
    <div className="grid gap-2">
      <div
        ref={containerRef}
        aria-invalid={invalid}
        className="z-0 h-80 w-full overflow-hidden rounded-lg border border-input aria-invalid:border-destructive"
      />
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
