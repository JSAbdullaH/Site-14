import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Building2, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Geofence } from "../api";
import { GLASS } from "./format";

type Props = {
  zone: Geofence | null;
  saving: boolean;
  error: string | null;
  onSave: (values: { name: string; is_outdoor: boolean }) => void;
  onDeactivate?: () => void;
  onCancel: () => void;
};

function KindOption({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex flex-1 flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active ? "border-primary bg-accent/60 ring-1 ring-primary" : "bg-background hover:bg-secondary"
      }`}
    >
      <span className={`flex items-center gap-1.5 text-sm font-semibold ${active ? "text-accent-foreground" : ""}`}>
        {icon}
        {title}
      </span>
      <span className="text-[11px] leading-snug text-muted-foreground">{hint}</span>
    </button>
  );
}

export default function ZonePanel({ zone, saving, error, onSave, onDeactivate, onCancel }: Props) {
  const [name, setName] = useState(zone?.name ?? "");
  const [outdoor, setOutdoor] = useState(zone?.is_outdoor ?? false);

  useEffect(() => {
    setName(zone?.name ?? "");
    setOutdoor(zone?.is_outdoor ?? false);
  }, [zone]);

  return (
    <aside
      className={`pointer-events-auto absolute inset-x-2 bottom-7 z-40 rounded-2xl p-4 md:inset-x-auto md:bottom-auto md:right-3 md:top-16 md:w-80 ${GLASS} animate-in fade-in slide-in-from-bottom-3 duration-200 md:slide-in-from-bottom-0 md:slide-in-from-right-3`}
    >
      <p className="text-[15px] font-semibold">{zone ? "Edit zone" : "New zone"}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {zone ? "Drag the white corners on the map to reshape it." : "Give the zone you drew a name."}
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
          placeholder="Zone name, e.g. Block A scaffolding"
          maxLength={120}
          required
          autoFocus
          className="h-10"
        />

        <div role="radiogroup" aria-label="Zone type" className="flex gap-2">
          <KindOption
            active={!outdoor}
            onClick={() => setOutdoor(false)}
            icon={<Building2 className="size-4" />}
            title="Indoor"
            hint="Shaded or covered work"
          />
          <KindOption
            active={outdoor}
            onClick={() => setOutdoor(true)}
            icon={<Sun className="size-4" />}
            title="Outdoor"
            hint="Midday ban applies"
          />
        </div>

        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs font-medium text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" size="lg" className="flex-1" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : zone ? "Save changes" : "Create zone"}
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        {zone && onDeactivate && (
          <button
            type="button"
            onClick={onDeactivate}
            disabled={saving}
            className="self-start text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
          >
            Deactivate zone
          </button>
        )}
      </form>
    </aside>
  );
}
