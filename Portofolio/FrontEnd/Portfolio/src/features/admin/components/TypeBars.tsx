import DeviceIcon from "@/shared/components/DeviceIcon";
import { DEVICE_TYPE_LABEL } from "@/shared/lib/deviceTypes";
import type { DeviceType } from "@/shared/lib/deviceTypes";

export default function TypeBars({ counts }: { counts: Record<DeviceType, number> }) {
  const rows = (Object.entries(counts) as [DeviceType, number][]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, n]) => n));

  return (
    <ul className="space-y-3">
      {rows.map(([type, n]) => (
        <li key={type} className="grid grid-cols-[110px_1fr_40px] items-center gap-3 text-sm" title={`${DEVICE_TYPE_LABEL[type]}: ${n}`}>
          <span className="flex items-center gap-2 text-muted-foreground">
            <DeviceIcon type={type} className="size-4" />
            {DEVICE_TYPE_LABEL[type]}
          </span>
          <span className="h-2.5 rounded-full bg-secondary">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="text-right font-medium tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  );
}
