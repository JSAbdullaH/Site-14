import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EmptyState from "@/shared/components/EmptyState";
import StatusBadge from "@/shared/components/StatusBadge";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DEVICE_SOURCE_LABEL, DEVICE_TYPES, DEVICE_TYPE_LABEL, HEALTH_BADGE, timeAgo } from "@/shared/lib/deviceTypes";
import type { DeviceType } from "@/shared/lib/deviceTypes";
import AdminShell from "./components/AdminShell";
import { listAllDevices } from "./api";
import type { AdminDevice } from "./types";

const selectClass = "h-9 rounded-md border border-input bg-transparent px-3 text-sm";

export default function AllDevicesPage() {
  const [params, setParams] = useSearchParams();
  const company = params.get("company") ?? undefined;
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<DeviceType | "">("");
  const [health, setHealth] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      listAllDevices({ search: search.trim() || undefined, type: type || undefined, health: health || undefined, ...(company && { company_id: company }) })
        .then((res) => {
          setDevices(res.data);
          setTotal(res.total);
          setError("");
        })
        .catch((err: Error) => setError(err.message));
    }, search ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [search, type, health, company]);

  return (
    <AdminShell title="All devices" subtitle={`${total} device${total === 1 ? "" : "s"} across every company`}>
      {error && <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input placeholder="Search serial, name, model or company" value={search} onChange={(e) => setSearch(e.target.value)} className="w-72" />
        <select aria-label="Device type" value={type} onChange={(e) => setType(e.target.value as DeviceType | "")} className={selectClass}>
          <option value="">All types</option>
          {DEVICE_TYPES.map((t) => (
            <option key={t} value={t}>
              {DEVICE_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={health} onChange={(e) => setHealth(e.target.value)} className={selectClass}>
          <option value="">Any status</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="never">Never connected</option>
        </select>
        {company && (
          <button type="button" className="text-sm font-medium text-signal hover:underline" onClick={() => setParams({})}>
            Show every company
          </button>
        )}
      </div>

      {devices === null ? (
        <Skeleton className="h-48 w-full" />
      ) : devices.length === 0 ? (
        <EmptyState title="No devices found" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Carried by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Battery</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {devices.map((d) => {
                const badge = HEALTH_BADGE[d.health];
                const os = d.os ? [d.os.name, d.os.version].filter(Boolean).join(" ") : null;
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <DeviceIcon type={d.device_type} className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{d.name || d.serial_number}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-mono">{d.serial_number}</span>
                            {os ? ` · ${os}` : ""}
                            {` · ${DEVICE_SOURCE_LABEL[d.source]}`}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{d.company.name}</TableCell>
                    <TableCell>{d.employee?.full_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell>
                      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.battery_percent !== null ? `${d.battery_percent}%` : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{d.last_seen_at ? timeAgo(d.last_seen_at) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminShell>
  );
}
