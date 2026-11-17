import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ArrowLeft, Loader2, MapPin, Search, Shapes, X } from "lucide-react";
import type { Geofence, LiveWorker } from "../api";
import { STATUS } from "./status";
import { GLASS, initials } from "./format";
import { newPlaceSession, placesAvailable, suggestPlaces, type PlaceHit } from "@/shared/lib/googleMaps";

type Props = {
  workers: LiveWorker[];
  onMapIds: Set<string>;
  zones: Geofence[];
  /** Where to look for addresses first: the middle of the map. */
  near: () => google.maps.LatLng | null;
  onWorker: (w: LiveWorker) => void;
  onZone: (z: Geofence) => void;
  onPlace: (hit: PlaceHit) => void;
  onClear: () => void;
};

type Item =
  | { kind: "worker"; key: string; worker: LiveWorker }
  | { kind: "zone"; key: string; zone: Geofence }
  | { kind: "place"; key: string; place: PlaceHit };

const MAX_PEOPLE = 6;
const MAX_ZONES = 4;
const PLACE_MIN_CHARS = 3;
const PLACE_DELAY_MS = 300;

// Case and Arabic diacritics do not matter when matching.
const norm = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");

function rank(text: string, q: string) {
  const t = norm(text);
  if (t.startsWith(q)) return 0;
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 1;
  return t.includes(q) ? 2 : -1;
}

export default function MapSearch({ workers, onMapIds, zones, near, onWorker, onZone, onPlace, onClear }: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false); // phones: the icon opens a full-width field
  const [active, setActive] = useState(0);
  const [placesFor, setPlaces] = useState<{ text: string; hits: PlaceHit[] }>({ text: "", hits: [] });
  const [placesLoading, setPlacesLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const listId = useId();

  const q = norm(query.trim());

  const people = useMemo(() => {
    if (!q) return [];
    return workers
      .map((w) => {
        const scores = [rank(w.full_name, q), w.employee_number ? rank(w.employee_number, q) : -1, rank(w.job_category, q)]
          .filter((s) => s >= 0);
        return { w, score: scores.length ? Math.min(...scores) : -1 };
      })
      .filter((r) => r.score >= 0)
      // Live on the map first, then the best match, then by name.
      .sort((a, b) => Number(onMapIds.has(b.w.employee_id)) - Number(onMapIds.has(a.w.employee_id)) || a.score - b.score || a.w.full_name.localeCompare(b.w.full_name))
      .slice(0, MAX_PEOPLE)
      .map((r) => r.w);
  }, [workers, onMapIds, q]);

  const zoneHits = useMemo(
    () => (q ? zones.filter((z) => rank(z.name, q) >= 0).slice(0, MAX_ZONES) : []),
    [zones, q],
  );

  // Addresses come from Google, a moment after typing stops, so each keystroke is not a request.
  const placeText = query.trim();
  const wantPlaces = focused && placeText.length >= PLACE_MIN_CHARS && placesAvailable();
  useEffect(() => {
    if (!wantPlaces) return;
    let live = true;
    const t = window.setTimeout(async () => {
      setPlacesLoading(true);
      sessionRef.current ??= newPlaceSession();
      const hits = await suggestPlaces(placeText, near(), sessionRef.current);
      if (!live) return;
      setPlaces({ text: placeText, hits: (hits ?? []).slice(0, 4) });
      setPlacesLoading(false);
    }, PLACE_DELAY_MS);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [placeText, wantPlaces, near]);
  // Only results for what is typed now; older ones vanish instead of lingering.
  const places = wantPlaces && placesFor.text === placeText ? placesFor.hits : [];

  const items: Item[] = [
    ...people.map((w) => ({ kind: "worker" as const, key: `w-${w.employee_id}`, worker: w })),
    ...zoneHits.map((z) => ({ kind: "zone" as const, key: `z-${z.id}`, zone: z })),
    ...places.map((p) => ({ kind: "place" as const, key: `p-${p.id}`, place: p })),
  ];

  // "/" jumps to the search from anywhere on the page, as on most map apps.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))) return;
      e.preventDefault();
      setExpanded(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clicking anywhere else closes the results.
  useEffect(() => {
    if (!focused) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [focused]);

  function pick(item: Item) {
    if (item.kind === "worker") onWorker(item.worker);
    else if (item.kind === "zone") onZone(item.zone);
    else {
      onPlace(item.place);
      sessionRef.current = null; // a selection ends Google's billing session
    }
    setFocused(false);
    inputRef.current?.blur();
    setQuery(item.kind === "worker" ? item.worker.full_name : item.kind === "zone" ? item.zone.name : item.place.title);
  }

  function clear() {
    setQuery("");
    setActive(0);
    onClear();
    inputRef.current?.focus();
  }

  function close() {
    setFocused(false);
    setExpanded(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      if (query) {
        setQuery("");
        setActive(0);
      } else close();
    }
  }

  const open = focused && q.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  const row = (item: Item, content: ReactNode) => {
    const i = items.findIndex((x) => x.key === item.key);
    return (
      <li key={item.key} id={optionId(i)} role="option" aria-selected={i === active}>
        <button
          type="button"
          onMouseEnter={() => setActive(i)}
          onClick={() => pick(item)}
          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${i === active ? "bg-secondary" : ""}`}
        >
          {content}
        </button>
      </li>
    );
  };

  return (
    <div
      ref={boxRef}
      className={`pointer-events-auto ${
        expanded ? "absolute inset-x-0 top-0 z-20 md:static md:z-auto" : "ml-auto md:ml-0"
      } md:w-64 lg:w-72`}
    >
      {/* Phones: an icon until it is needed, so the top bar stays one row. */}
      {!expanded && (
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          aria-label="Search the map"
          className={`inline-flex size-9 items-center justify-center rounded-full md:hidden ${GLASS}`}
        >
          <Search className="size-4" />
        </button>
      )}

      <div className={`relative ${expanded ? "block" : "hidden md:block"}`}>
        <div className={`flex h-9 items-center gap-2 rounded-full pr-1.5 pl-3 ${GLASS} ${open ? "ring-2 ring-primary/40" : ""}`}>
          {expanded ? (
            <button type="button" onClick={close} aria-label="Close search" className="-ml-1 inline-flex size-7 items-center justify-center rounded-full hover:bg-secondary md:hidden">
              <ArrowLeft className="size-4" />
            </button>
          ) : null}
          <Search className={`size-4 shrink-0 text-muted-foreground ${expanded ? "hidden md:block" : ""}`} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onFocus={() => setFocused(true)}
            onKeyDown={onKeyDown}
            placeholder="Search people, zones, places"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && items[active] ? optionId(active) : undefined}
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
          {query ? (
            <button type="button" onClick={clear} aria-label="Clear search" className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="mr-1 hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground md:inline">/</kbd>
          )}
        </div>

        {open && (
          <div className={`absolute top-11 right-0 left-0 max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain rounded-2xl p-1.5 md:w-[22rem] ${GLASS} animate-in fade-in slide-in-from-top-1 duration-150`}>
            <ul id={listId} role="listbox" aria-label="Search results">
              {people.length > 0 && <Heading>People</Heading>}
              {people.map((w) => {
                const s = STATUS[w.status];
                const live = onMapIds.has(w.employee_id);
                return row(
                  { kind: "worker", key: `w-${w.employee_id}`, worker: w },
                  <>
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: s.color, opacity: live ? 1 : 0.5 }}
                    >
                      {initials(w.full_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{w.full_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {w.job_category}
                        {w.employee_number ? ` · #${w.employee_number}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: s.color, background: s.bg }}>
                      {live ? s.label : "Not on map"}
                    </span>
                  </>,
                );
              })}

              {zoneHits.length > 0 && <Heading>Zones</Heading>}
              {zoneHits.map((z) =>
                row(
                  { kind: "zone", key: `z-${z.id}`, zone: z },
                  <>
                    <span
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                      style={{ background: z.is_outdoor ? "#DB44061f" : "#4F7A5B1f", color: z.is_outdoor ? "#DB4406" : "#4F7A5B" }}
                    >
                      <Shapes className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{z.name}</span>
                      <span className="block text-xs text-muted-foreground">{z.is_outdoor ? "Outdoor zone" : "Indoor zone"}</span>
                    </span>
                  </>,
                ),
              )}

              {(places.length > 0 || (wantPlaces && placesLoading)) && (
                <Heading>
                  Places
                  {wantPlaces && placesLoading && <Loader2 className="size-3 animate-spin" />}
                </Heading>
              )}
              {places.map((p) =>
                row(
                  { kind: "place", key: `p-${p.id}`, place: p },
                  <>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <MapPin className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{p.title}</span>
                      {p.subtitle && <span className="block truncate text-xs text-muted-foreground">{p.subtitle}</span>}
                    </span>
                  </>,
                ),
              )}
            </ul>

            {items.length === 0 && !(wantPlaces && placesLoading) && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No person or zone matches “{query.trim()}”.
                {query.trim().length < PLACE_MIN_CHARS && placesAvailable() && (
                  <span className="mt-1 block text-xs">Type a few more letters to search addresses.</span>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <li role="presentation" className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </li>
  );
}
