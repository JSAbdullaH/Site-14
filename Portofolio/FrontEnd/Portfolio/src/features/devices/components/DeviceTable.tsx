import { BatteryFull, BatteryLow, BatteryMedium, MoreHorizontal, Truck } from "lucide-react";
import StatusBadge from "@/shared/components/StatusBadge";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { DEVICE_SOURCE_LABEL, DEVICE_TYPE_LABEL, HEALTH_BADGE, timeAgo } from "@/shared/lib/deviceTypes";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clockLabel, deviceDetails, displayName, inTransit } from "../types";
import type { Device } from "../types";

type Props = {
  devices: Device[];
  canEdit: boolean;
  onAssign: (device: Device) => void;
  onUnassign: (device: Device) => void;
  onRename: (device: Device) => void;
  onNewKey: (device: Device) => void;
  onToggleActive: (device: Device) => void;
  onRemove: (device: Device) => void;
};

function Battery({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-muted-foreground">—</span>;
  const Icon = percent > 60 ? BatteryFull : percent > 20 ? BatteryMedium : BatteryLow;
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${percent <= 20 ? "text-danger" : ""}`}>
      <Icon className="size-4" />
      {percent}%
    </span>
  );
}

export default function DeviceTable({
  devices,
  canEdit,
  onAssign,
  onUnassign,
  onRename,
  onNewKey,
  onToggleActive,
  onRemove,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>Carried by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Battery</TableHead>
            <TableHead>Last seen</TableHead>
            {canEdit && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>

        <TableBody>
          {devices.map((d) => {
            const transit = inTransit(d);
            const health = HEALTH_BADGE[d.health];
            const drift = clockLabel(d.clock_offset_seconds);
            const details = deviceDetails(d);

            return (
              <TableRow key={d.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary"
                      title={DEVICE_TYPE_LABEL[d.device_type]}
                    >
                      <DeviceIcon type={d.device_type} className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{displayName(d)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{d.serial_number}</span>
                        {details ? ` · ${details}` : ` · ${DEVICE_TYPE_LABEL[d.device_type]}`}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{DEVICE_SOURCE_LABEL[d.source]}</p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  {d.employee ? (
                    <div>
                      <p className="font-medium">{d.employee.full_name}</p>
                      <p className="text-xs text-muted-foreground">{d.employee.site?.name ?? "No site"}</p>
                    </div>
                  ) : canEdit && d.is_active ? (
                    <button
                      type="button"
                      onClick={() => onAssign(d)}
                      className="text-sm font-medium text-signal hover:underline"
                    >
                      Assign
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>

                <TableCell>
                  {transit ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-2.5 py-1 text-xs font-medium text-info">
                      <Truck className="size-3.5" />
                      {d.order?.status === "shipped" ? "On its way" : "Preparing"}
                    </span>
                  ) : (
                    <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
                  )}
                </TableCell>

                <TableCell>
                  <Battery percent={d.battery_percent} />
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {d.last_seen_at ? timeAgo(d.last_seen_at) : "—"}
                  {drift && (
                    <span
                      className="block text-xs font-medium text-warn"
                      title="Difference between the device clock and the server clock on its last call."
                    >
                      Clock {drift}
                    </span>
                  )}
                </TableCell>

                {canEdit && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Actions for ${displayName(d)}`}
                        className="inline-flex size-8 items-center justify-center rounded-md hover:bg-secondary"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        {d.is_active && (
                          <DropdownMenuItem onClick={() => onAssign(d)}>
                            {d.employee ? "Give to another employee" : "Assign to employee"}
                          </DropdownMenuItem>
                        )}
                        {d.employee && <DropdownMenuItem onClick={() => onUnassign(d)}>Take back</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => onRename(d)}>Rename</DropdownMenuItem>
                        {d.source !== "paired" && !transit && (
                          <DropdownMenuItem onClick={() => onNewKey(d)}>New device key</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={d.is_active ? "text-destructive" : undefined}
                          onClick={() => onToggleActive(d)}
                        >
                          {d.is_active ? "Deactivate" : "Reactivate"}
                        </DropdownMenuItem>
                        {d.source !== "marketplace" && (
                          <DropdownMenuItem className="text-destructive" onClick={() => onRemove(d)}>
                            Remove
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
