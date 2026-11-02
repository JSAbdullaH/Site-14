import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Geofence } from "../api";

type Props = {
  zone: Geofence | null;
  saving: boolean;
  error: string | null;
  onSave: (values: { name: string; is_outdoor: boolean }) => void;
  onDeactivate?: () => void;
  onCancel: () => void;
};

export default function ZonePanel({
  zone,
  saving,
  error,
  onSave,
  onDeactivate,
  onCancel,
}: Props) {
  const [name, setName] = useState(zone?.name ?? "");
  const [outdoor, setOutdoor] = useState(zone?.is_outdoor ?? false);

  useEffect(() => {
    setName(zone?.name ?? "");
    setOutdoor(zone?.is_outdoor ?? false);
  }, [zone]);

  return (
    <aside className="absolute inset-x-3 bottom-3 z-10 rounded-xl border bg-card p-5 shadow-lg md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:w-72">
      <p className="font-semibold">{zone ? "Edit zone" : "New zone"}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {zone
          ? "Drag the corners on the map to reshape it."
          : "Name the zone you drew."}
      </p>

      <form
        className="mt-4 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name: name.trim(), is_outdoor: outdoor });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Zone name"
          maxLength={120}
          required
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={outdoor}
            onChange={(e) => setOutdoor(e.target.checked)}
          />
          Outdoor — midday ban applies
        </label>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        {zone && onDeactivate && (
          <button
            type="button"
            onClick={onDeactivate}
            disabled={saving}
            className="text-left text-xs font-medium text-muted-foreground hover:text-destructive"
          >
            Deactivate zone
          </button>
        )}
      </form>
    </aside>
  );
}