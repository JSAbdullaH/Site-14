import { MoreHorizontal } from "lucide-react";
import StatusBadge from "@/shared/components/StatusBadge";
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
import { clockLabel, deviceHealth, timeAgo } from "../types";
import type { Device } from "../types";

const HEALTH = {
  online: { tone: "ok", label: "Online" },
  offline: { tone: "warn", label: "Offline" },
  never: { tone: "neutral", label: "Never connected" },
  inactive: { tone: "neutral", label: "Deactivated" },
} as const;

type Props = {
  devices: Device[];
  // Only an admin changes devices; managers see the table without actions.
  canEdit: boolean;
  onAssign: (device: Device) => void;
  onUnassign: (device: Device) => void;
  onNewKey: (device: Device) => void;
  onToggleActive: (device: Device) => void;
};

export default function DeviceTable({
  devices,
  canEdit,
  onAssign,
  onUnassign,
  onNewKey,
  onToggleActive,
}: Props) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Serial</TableHead>
            <TableHead>Worn by</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead>Clock</TableHead>
            {canEdit && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>

        <TableBody>
          {devices.map((d) => {
            const health = HEALTH[deviceHealth(d)];
            const drift = clockLabel(d.clock_offset_seconds);

            return (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.serial_number}</TableCell>

                <TableCell>
                  {d.employee ? (
                    <div>
                      <p className="font-medium">{d.employee.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.employee.site?.name ?? "No site"}
                      </p>
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
                  <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
                </TableCell>

                <TableCell className="text-muted-foreground">
                  {d.last_seen_at ? timeAgo(d.last_seen_at) : "—"}
                </TableCell>

                <TableCell>
                  {drift ? (
                    <span
                      className="text-xs font-medium text-warn"
                      title="Difference between the device clock and the server clock on its last call. Both clocks are stored with every reading."
                    >
                      {drift}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{d.last_seen_at ? "In sync" : "—"}</span>
                  )}
                </TableCell>

                {canEdit && (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md hover:bg-secondary">
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        {d.is_active && (
                          <DropdownMenuItem onClick={() => onAssign(d)}>
                            {d.employee ? "Give to another employee" : "Assign to employee"}
                          </DropdownMenuItem>
                        )}
                        {d.employee && (
                          <DropdownMenuItem onClick={() => onUnassign(d)}>
                            Take back
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onNewKey(d)}>
                          New device key
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className={d.is_active ? "text-destructive" : undefined}
                          onClick={() => onToggleActive(d)}
                        >
                          {d.is_active ? "Deactivate" : "Reactivate"}
                        </DropdownMenuItem>
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
