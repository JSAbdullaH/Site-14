import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, QrCode, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/shared/components/AppShell";
import ConfirmDialog from "@/shared/components/ConfirmDialog";
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
  const [pending, setPending] = useState<Pending | null>(null);

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

  const unassign = (d: Device) => setPending({ kind: "unassign", device: d });
  const newKey = (d: Device) => setPending({ kind: "newKey", device: d });
  const remove = (d: Device) => setPending({ kind: "remove", device: d });
  // Reactivating is harmless, so only deactivating asks first.
  const toggleActive = (d: Device) =>
    d.is_active ? setPending({ kind: "deactivate", device: d }) : run(() => updateDevice(d.id, { is_active: true }));

  // Errors thrown here are shown inside the dialog, which stays open.
  const confirm = pending ? confirmation(pending, {
    unassign: async (d) => {
      await updateDevice(d.id, { employee_id: null, end_shift: true });
      toast.success(`${displayName(d)} taken back`);
      await load();
    },
    deactivate: async (d) => {
      await updateDevice(d.id, { is_active: false, end_shift: true });
      toast.success(`${displayName(d)} deactivated`);
      await load();
    },
    newKey: async (d) => {
      const withKey = await rotateDeviceKey(d.id);
      setKeys([withKey]);
      await load();
    },
    remove: async (d) => {
      await removeDevice(d.id, true);
      toast.success(`${displayName(d)} removed`);
      await load();
    },
  }) : null;

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

      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          {...confirm}
        />
      )}
    </AppShell>
  );
}

type Pending = { kind: "unassign" | "deactivate" | "newKey" | "remove"; device: Device };
type Actions = Record<Pending["kind"], (d: Device) => Promise<void>>;

// Shown first when the wearer is at work right now.
function shiftWarning(d: Device) {
  return d.on_shift && d.employee
    ? [`${d.employee.full_name} is at work right now. Their shift ends now, at the last position the device sent.`]
    : [];
}

function confirmation({ kind, device: d }: Pending, actions: Actions) {
  const name = displayName(d);
  const onConfirm = () => actions[kind](d);
  const working = Boolean(d.on_shift && d.employee);
  switch (kind) {
    case "unassign":
      return {
        title: working ? `${d.employee?.full_name} is at work. Take ${name} back?` : `Take ${name} back?`,
        description: `${d.employee?.full_name ?? "The wearer"} stops being tracked until they get a device again.`,
        details: [...shiftWarning(d), "The device stays in your inventory, ready to give to someone else."],
        confirmLabel: working ? "End shift and take back" : "Take back",
        tone: working ? ("danger" as const) : ("default" as const),
        onConfirm,
      };
    case "deactivate":
      return {
        title: working ? `${d.employee?.full_name} is at work. Deactivate ${name}?` : `Deactivate ${name}?`,
        description: "It stops being accepted at once.",
        details: [
          ...shiftWarning(d),
          ...(d.employee ? [`It is taken back from ${d.employee.full_name}.`] : []),
          "Its recorded shifts stay in History and on reports.",
          "You can reactivate it later from the Deactivated list.",
        ],
        confirmLabel: working ? "End shift and deactivate" : "Deactivate",
        onConfirm,
      };
    case "newKey":
      return {
        title: `Make a new key for ${name}?`,
        description: "The current key stops working at once. The device must be set up again with the new one.",
        confirmLabel: "Make new key",
        tone: "default" as const,
        onConfirm,
      };
    case "remove":
      return {
        title: working ? `${d.employee?.full_name} is at work. Remove ${name}?` : `Remove ${name}?`,
        description: "It is deleted from your company and its key stops working. To use it again, it must be connected or registered again.",
        details: [
          ...shiftWarning(d),
          ...(d.employee ? [`It is taken back from ${d.employee.full_name}.`] : []),
          d.has_history
            ? "The hours it recorded stay with the employee, in History and on reports."
            : "It has no recorded shifts, so no history is lost.",
        ],
        confirmLabel: working ? "End shift and remove" : "Remove device",
        onConfirm,
      };
  }
}
