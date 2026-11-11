import type { DeviceFilter, DeviceSummary } from "../types";

type Tile = { filter: DeviceFilter; label: string; hint: string; dot?: string; value: (s: DeviceSummary) => number };

const TILES: Tile[] = [
  { filter: "active", label: "In fleet", hint: "Active devices", value: (s) => s.active },
  { filter: "online", label: "Online", hint: "Heard in the last 2 min", dot: "bg-ok", value: (s) => s.online },
  { filter: "offline", label: "Offline", hint: "Silent for over 2 min", dot: "bg-warn", value: (s) => s.offline },
  { filter: "never", label: "Not connected", hint: "Waiting for first signal", dot: "bg-muted-foreground", value: (s) => s.never },
  { filter: "unassigned", label: "Unassigned", hint: "Not carried by anyone", dot: "bg-info", value: (s) => s.unassigned },
  { filter: "inactive", label: "Deactivated", hint: "Refused by the server", dot: "bg-danger", value: (s) => s.inactive },
];

type Props = {
  summary: DeviceSummary | null;
  filter: DeviceFilter;
  onFilter: (filter: DeviceFilter) => void;
};

export default function DeviceStats({ summary, filter, onFilter }: Props) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {TILES.map((t) => {
        const selected = filter === t.filter;
        return (
          <button
            key={t.filter}
            type="button"
            aria-pressed={selected}
            onClick={() => onFilter(t.filter)}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              selected ? "border-primary bg-secondary" : "hover:bg-secondary/60"
            }`}
          >
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {t.dot && <span className={`size-2 rounded-full ${t.dot}`} />}
              {t.label}
            </span>
            <span className="mt-1 block text-2xl font-semibold tabular-nums">{summary ? t.value(summary) : "–"}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{t.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
