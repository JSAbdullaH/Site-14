import { useEffect, useState } from "react";
import type { Geofence } from "../../lib/mapApi";

type Props = {
  zone: Geofence | null;
  saving: boolean;
  error: string | null;
  onSave: (values: { name: string; is_outdoor: boolean }) => void;
  onDeactivate?: () => void;
  onCancel: () => void;
};

export default function ZonePanel({ zone, saving, error, onSave, onDeactivate, onCancel }: Props) {
  const [name, setName] = useState(zone?.name ?? "");
  const [outdoor, setOutdoor] = useState(zone?.is_outdoor ?? false);

  useEffect(() => {
    setName(zone?.name ?? "");
    setOutdoor(zone?.is_outdoor ?? false);
  }, [zone]);

  return (
    <aside className="absolute z-10 bg-page shadow-lg rounded-card p-5 inset-x-3 bottom-3 md:inset-x-auto md:right-4 md:top-4 md:bottom-auto md:w-72">
      <p className="font-bold">{zone ? "Edit zone" : "New zone"}</p>
      <p className="text-[12px] text-muted font-semibold mt-1">
        {zone ? "Drag the corners on the map to reshape it." : "Name the zone you drew."}
      </p>
      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name: name.trim(), is_outdoor: outdoor });
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Zone name"
          maxLength={120}
          required
          className="h-10 px-3 rounded-ctrl bg-bone border border-sand2 font-semibold"
        />
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={outdoor} onChange={(e) => setOutdoor(e.target.checked)} />
          Outdoor (midday ban applies)
        </label>
        {error && <p className="text-[13px] text-signal font-semibold">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="h-10 px-4 rounded-ctrl bg-signal text-white font-bold disabled:opacity-55"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-ctrl font-bold hover:bg-sand">
            Cancel
          </button>
        </div>
        {zone && onDeactivate && (
          <button
            type="button"
            onClick={onDeactivate}
            disabled={saving}
            className="text-left text-[13px] font-bold text-muted hover:text-signal"
          >
            Deactivate zone
          </button>
        )}
      </form>
    </aside>
  );
}
