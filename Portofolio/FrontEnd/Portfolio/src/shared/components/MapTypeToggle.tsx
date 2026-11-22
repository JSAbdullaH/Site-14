import { useState } from "react";
import { SATELLITE, STREET } from "@/shared/lib/googleMaps";

type Props = { map: google.maps.Map | null; className?: string };

// Satellite / street switch for the smaller maps (site boundary, path replay).
export default function MapTypeToggle({ map, className = "" }: Props) {
  const [type, setType] = useState<string>(SATELLITE);
  if (!map) return null;
  const choose = (next: string) => {
    setType(next);
    map.setMapTypeId(next);
  };
  const options = [
    { id: SATELLITE, label: "Satellite" },
    { id: STREET, label: "Street" },
  ];
  return (
    <div className={`absolute top-2 left-2 z-10 flex rounded-lg bg-white/95 p-0.5 text-xs font-semibold shadow-md ${className}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={type === o.id}
          onClick={() => choose(o.id)}
          className={`rounded-md px-2.5 py-1.5 transition-colors ${type === o.id ? "bg-ink text-white" : "text-foreground/75 hover:bg-secondary"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
