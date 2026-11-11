import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, QrCode, ShoppingBag } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import DeviceIcon from "@/shared/components/DeviceIcon";
import { isAdmin } from "@/shared/lib/auth";
import { DEVICE_TYPES, DEVICE_TYPE_LABEL } from "@/shared/lib/deviceTypes";
import type { DeviceType } from "@/shared/lib/deviceTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import DeviceStats from "./components/DeviceStats";
import DeviceTable from "./components/DeviceTable";
import ConnectDeviceDialog from "./components/ConnectDeviceDialog";
import RegisterDevicesDialog from "./components/RegisterDevicesDialog";
import AssignDeviceDialog from "./components/AssignDeviceDialog";
import RenameDeviceDialog from "./components/RenameDeviceDialog";
import DeviceKeysDialog from "./components/DeviceKeysDialog";
import { getDeviceSummary, listDevices, removeDevice, rotateDeviceKey, updateDevice } from "./api";
import { displayName } from "./types";
import type { Device, DeviceFilter, DeviceSummary, DeviceWithKey } from "./types";

const REFRESH_MS = 10_000;

export default function DevicesPage() {
  const admin = isAdmin();

  const [devices, setDevices] = useState<Device[]>([]);
  const [summary, setSummary] = useState<DeviceSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<DeviceFilter>("active");
  const [type, setType] = useState<DeviceType | undefined>();
  const [search, setSearch] = useState("");

  const [connectOpen, setConnectOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [assigning, setAssigning] = useState<Device | null>(null);
  const [renaming, setRenaming] = useState<Device | null>(null);
  const [keys, setKeys] = useState<DeviceWithKey[]>([]);

  const load = useCallback(async () => {
    try {
      const [res, stats] = await Promise.all([
        listDevices({ filter, type, search: search.trim() || undefined }),
        getDeviceSummary(),
      ]);
      setDevices(res.data);
      setTotal(res.total);
      setSummary(stats);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, type, search]);

  useEffect(() => {
    const first = window.setTimeout(load, search ? 250 : 0);
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load, search]);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const unassign = (d: Device) => {
    if (!window.confirm(`Take ${displayName(d)} back from ${d.employee?.full_name}?`)) return;
    run(() => updateDevice(d.id, { employee_id: null }));
  };

  const toggleActive = (d: Device) => {
    if (d.is_active && !window.confirm(`Deactivate ${displayName(d)}? It stops being accepted at once, and is taken back from its wearer.`)) return;
    run(() => updateDevice(d.id, { is_active: !d.is_active }));
  };

  const newKey = (d: Device) => {
    if (!window.confirm(`Make a new key for ${displayName(d)}? The current key stops working at once.`)) return;
    run(async () => setKeys([await rotateDeviceKey(d.id)]));
  };

  const remove = (d: Device) => {
    if (!window.confirm(`Remove ${displayName(d)} from your company? It must connect again to come back.`)) return;
    run(() => removeDevice(d.id));
  };

  const changeFilter = (next: DeviceFilter) => {
    setLoading(true);
    setFilter(next);
  };

  const changeType = (next: DeviceType | undefined) => {
    setLoading(true);
    setType(next);
  };

  const subtitle = summary
    ? `${summary.active} device${summary.active === 1 ? "" : "s"}, ${summary.online} online${summary.in_transit ? `, ${summary.in_transit} on the way` : ""}`
    : "Phones, watches, laptops and trackers";

  return (
    <AppShell title="Devices" subtitle={subtitle}>
      {error && (
        <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>
      )}

      <DeviceStats summary={summary} filter={filter} onFilter={changeFilter} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex flex-wrap rounded-md border p-0.5" role="group" aria-label="Device type">
            <button
              type="button"
              aria-pressed={!type}
              onClick={() => changeType(undefined)}
              className={`rounded px-3 py-1.5 text-sm font-medium ${!type ? "bg-secondary" : "text-muted-foreground hover:text-foreground"}`}
            >
              All types
            </button>
            {DEVICE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => changeType(t)}
                className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${
                  type === t ? "bg-secondary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <DeviceIcon type={t} className="size-3.5" />
                {DEVICE_TYPE_LABEL[t]}
                {summary && summary.by_type[t] > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">{summary.by_type[t]}</span>
                )}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search name, serial, model or wearer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
        </div>

        {admin && (
          <div className="flex flex-wrap gap-2">
            <Link
              to="/marketplace"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-secondary"
            >
              <ShoppingBag className="size-4" />
              Buy devices
            </Link>
            <Button variant="outline" onClick={() => setRegisterOpen(true)}>
              <Plus />
              Register by serial
            </Button>
            <Button onClick={() => setConnectOpen(true)}>
              <QrCode />
              Connect a device
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          title={search ? "No matching devices" : filter === "active" && !type ? "No devices yet" : "Nothing here"}
          description={
            search
              ? "Try another name, serial or model."
              : filter === "active" && !type
                ? "Connect a phone, laptop or watch with a QR code, or buy ready-to-use devices from the marketplace."
                : undefined
          }
          action={
            admin && filter === "active" && !type && !search ? (
              <Button onClick={() => setConnectOpen(true)}>
                <QrCode />
                Connect a device
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DeviceTable
            devices={devices}
            canEdit={admin}
            onAssign={setAssigning}
            onUnassign={unassign}
            onRename={setRenaming}
            onNewKey={newKey}
            onToggleActive={toggleActive}
            onRemove={remove}
          />
          {total > devices.length && (
            <p className="mt-3 text-sm text-muted-foreground">
              Showing {devices.length} of {total}. Search to narrow the list.
            </p>
          )}
        </>
      )}

      <ConnectDeviceDialog open={connectOpen} onOpenChange={setConnectOpen} onConnected={load} />

      <RegisterDevicesDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={(created) => {
          setKeys(created);
          load();
        }}
      />

      <AssignDeviceDialog
        key={assigning?.id ?? "none"}
        device={assigning}
        onClose={() => setAssigning(null)}
        onAssigned={load}
      />

      <RenameDeviceDialog
        key={renaming?.id ?? "rename"}
        device={renaming}
        onClose={() => setRenaming(null)}
        onRenamed={load}
      />

      <DeviceKeysDialog devices={keys} onClose={() => setKeys([])} />
    </AppShell>
  );
}
