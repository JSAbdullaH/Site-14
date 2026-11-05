import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import { isAdmin } from "@/shared/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import DeviceTable from "./components/DeviceTable";
import RegisterDevicesDialog from "./components/RegisterDevicesDialog";
import AssignDeviceDialog from "./components/AssignDeviceDialog";
import DeviceKeysDialog from "./components/DeviceKeysDialog";
import { listDevices, rotateDeviceKey, updateDevice } from "./api";
import { deviceHealth } from "./types";
import type { Device, DeviceWithKey } from "./types";

type Filter = "all" | "unassigned" | "inactive";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Active" },
  { value: "unassigned", label: "Unassigned" },
  { value: "inactive", label: "Deactivated" },
];

// Refreshed while open, so devices can be watched coming online.
const REFRESH_MS = 15_000;

export default function DevicesPage() {
  const admin = isAdmin();

  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const [registerOpen, setRegisterOpen] = useState(false);
  const [assigning, setAssigning] = useState<Device | null>(null);
  const [keys, setKeys] = useState<DeviceWithKey[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await listDevices({
        status: filter === "inactive" ? "inactive" : "active",
        assigned: filter === "unassigned" ? false : undefined,
        search: search.trim() || undefined,
      });
      setDevices(res.data);
      setTotal(res.total);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const t = window.setTimeout(load, search ? 250 : 0);
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      window.clearTimeout(t);
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
    if (!window.confirm(`Take ${d.serial_number} back from ${d.employee?.full_name}?`)) return;
    run(() => updateDevice(d.id, { employee_id: null }));
  };

  const toggleActive = (d: Device) => {
    if (d.is_active && !window.confirm(`Deactivate ${d.serial_number}? It stops being accepted at once, and is taken back from its wearer.`)) return;
    run(() => updateDevice(d.id, { is_active: !d.is_active }));
  };

  const newKey = (d: Device) => {
    if (!window.confirm(`Make a new key for ${d.serial_number}? The current key stops working at once.`)) return;
    run(async () => setKeys([await rotateDeviceKey(d.id)]));
  };

  const online = devices.filter((d) => deviceHealth(d) === "online").length;

  return (
    <AppShell
      title="Devices"
      subtitle={loading ? "Tracking devices" : `${total} device${total === 1 ? "" : "s"}${filter === "all" ? `, ${online} online` : ""}`}
    >
      {error && (
        <p className="mb-5 rounded-md bg-danger-bg px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-md border p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setFilter(f.value);
                }}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  filter === f.value ? "bg-secondary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search by serial or wearer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>

        {admin && (
          <Button onClick={() => setRegisterOpen(true)}>
            <Plus />
            Register devices
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          title={search ? "No matching devices" : filter === "all" ? "No devices yet" : "Nothing here"}
          description={
            search
              ? "Try another serial or name."
              : filter === "all"
                ? "Register the devices your workers wear. Paste a whole box of serials at once."
                : undefined
          }
          action={
            admin && filter === "all" && !search ? (
              <Button onClick={() => setRegisterOpen(true)}>Register devices</Button>
            ) : undefined
          }
        />
      ) : (
        <DeviceTable
          devices={devices}
          canEdit={admin}
          onAssign={setAssigning}
          onUnassign={unassign}
          onNewKey={newKey}
          onToggleActive={toggleActive}
        />
      )}

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

      <DeviceKeysDialog devices={keys} onClose={() => setKeys([])} />
    </AppShell>
  );
}
