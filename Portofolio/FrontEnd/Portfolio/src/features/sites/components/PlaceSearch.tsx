import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { newPlaceSession, placeLocation, placesAvailable, suggestPlaces, type LatLngLiteral, type PlaceHit } from "@/shared/lib/googleMaps";

type Props = {
  map: google.maps.Map;
  onPick: (at: LatLngLiteral) => void;
  /** Where the box sits on the map; top right by default. */
  className?: string;
};

const MIN_CHARS = 3;
const DELAY_MS = 300;

export default function PlaceSearch({ map, onPick, className = "top-2 right-2 w-72 max-w-[calc(100%-1rem)]" }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const text = query.trim();

  useEffect(() => {
    if (text.length < MIN_CHARS || !placesAvailable()) {
      setHits([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(async () => {
      setLoading(true);
      sessionRef.current ??= newPlaceSession();
      const found = await suggestPlaces(text, map.getCenter() ?? null, sessionRef.current);
      if (!live) return;
      setHits((found ?? []).slice(0, 5));
      setActive(0);
      setLoading(false);
    }, DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [text, map]);

  async function pick(hit: PlaceHit) {
    setOpen(false);
    setQuery(hit.title);
    sessionRef.current = null;
    const at = await placeLocation(hit);
    if (at) onPick(at);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (hits[active]) pick(hits[active]);
    } else if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!placesAvailable()) return null;

  return (
    <div className={`absolute z-10 ${className}`}>
      <div className="flex h-9 items-center gap-2 rounded-full border bg-background/95 pr-1.5 pl-3 shadow-md">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder="Search the site address"
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setHits([]);
            }}
            aria-label="Clear search"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && hits.length > 0 && (
        <ul className="mt-1 rounded-2xl border bg-background p-1.5 shadow-md">
          {hits.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left ${i === active ? "bg-secondary" : ""}`}
              >
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{h.title}</span>
                  {h.subtitle && <span className="block truncate text-xs text-muted-foreground">{h.subtitle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
