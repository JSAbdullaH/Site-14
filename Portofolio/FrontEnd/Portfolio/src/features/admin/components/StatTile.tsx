import type { ReactNode } from "react";

type Props = { label: string; value: ReactNode; hint?: ReactNode };

export default function StatTile({ label, value, hint }: Props) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
