import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, UserMinus } from "lucide-react";
import { toast } from "sonner";
import EmptyState from "@/shared/components/EmptyState";
import ConfirmDialog from "@/shared/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EmployeeTable from "./EmployeeTable";
import AddEmployeeDialog from "./AddEmployeeDialog";
import ImportCsvDialog from "./ImportCsvDialog";
import EditEmployeeDialog from "./EditEmployeeDialog";
import EmployeeDeviceDialog from "./EmployeeDeviceDialog";
import { Upload } from "lucide-react";
import { isAdmin } from "@/shared/lib/auth";
import { assignEmployeesToSite, deactivateEmployee, deactivateEmployees, listEmployees } from "../api";
import { listSites } from "@/features/sites/api";
import type { SiteSummary } from "@/features/sites/types";
import type { Employee, EmployeeStatus } from "../types";

export default function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deviceFor, setDeviceFor] = useState<Employee | null>(null);
  const [removing, setRemoving] = useState<Employee | null>(null);
  const [status, setStatus] = useState<EmployeeStatus>("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [target, setTarget] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingMany, setRemovingMany] = useState(false);
  const admin = isAdmin();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listEmployees({ limit: 100, status });
      setEmployees(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(e: Employee) {
    await deactivateEmployee(e.id);
    toast.success(`${e.full_name} was removed`, { description: "Their hours, alerts and tasks stay in History and reports." });
    await load();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.display_id.toLowerCase().includes(q) ||
        e.full_name.toLowerCase().includes(q) ||
        e.job_category.toLowerCase().includes(q) ||
        (e.employee_number ?? "").toLowerCase().includes(q),
    );
  }, [employees, query]);

  useEffect(() => {
    if (admin) listSites(true).then((r) => setSites(r.data)).catch(() => {});
  }, [admin]);

  useEffect(() => {
    setSelected(new Set());
  }, [status, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const ids = filtered.filter((e) => e.status === "active").map((e) => e.id);
    setSelected((prev) => (ids.every((id) => prev.has(id)) ? new Set() : new Set(ids)));
  }

  async function removeSelected() {
    const { removed } = await deactivateEmployees([...selected]);
    toast.success(`${removed} employee${removed === 1 ? " was" : "s were"} removed`, {
      description: "Their hours, alerts and tasks stay in History and reports.",
    });
    setSelected(new Set());
    await load();
  }

  async function assignSelected() {
    setAssigning(true);
    try {
      const siteId = target === "none" ? null : target;
      const { moved } = await assignEmployeesToSite([...selected], siteId);
      const name = sites.find((s) => s.id === target)?.name;
      toast.success(siteId ? `${moved} assigned to ${name}` : `${moved} unassigned`);
      setSelected(new Set());
      setTarget("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAssigning(false);
    }
  }

  return (
    <>
      {error && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          {error}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-3 text-sm focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 sm:max-w-sm">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            placeholder="Search by name, job, number or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            aria-label="Search employees"
          />
        </label>

        <div role="group" aria-label="Show" className="inline-flex rounded-lg bg-secondary p-0.5 text-sm font-medium">
          {(["active", "inactive"] as EmployeeStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={status === s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1.5 transition-colors ${status === s ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {s === "active" ? "Active" : "Removed"}
            </button>
          ))}
        </div>

        {/* Only an admin adds or imports employees; the server refuses anyone else. */}
        {admin && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload />
              Import CSV
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus />
              Add employee
            </Button>
          </div>
        )}
      </div>

      {admin && selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label="Site to assign"
          >
            <option value="" disabled>
              Choose a site
            </option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_id ? `${s.name} (${s.display_id})` : s.name}
              </option>
            ))}
            <option value="none">Unassign from any site</option>
          </select>
          <Button size="sm" onClick={assignSelected} disabled={!target || assigning}>
            {assigning ? "Assigning…" : "Assign"}
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setRemovingMany(true)} disabled={assigning}>
            <UserMinus />
            Remove
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query ? "No matching employees" : status === "inactive" ? "No removed employees" : "No employees yet"}
          description={
            query
              ? "Try a different name, job or number."
              : status === "inactive"
                ? "Employees you remove show here, with their history still available."
                : "Add your first field worker, or import a list from a CSV file."
          }
          action={
            !query && status === "active" && admin ? (
              <Button onClick={() => setAddOpen(true)}>Add employee</Button>
            ) : undefined
          }
        />
      ) : (
        <EmployeeTable
          employees={filtered}
          canEdit={admin}
          onEdit={setEditing}
          onDevice={setDeviceFor}
          onRemove={admin ? setRemoving : undefined}
          selected={admin && status === "active" ? selected : undefined}
          onToggle={toggle}
          onToggleAll={toggleAll}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.full_name ?? "this employee"}?`}
        description="They leave the active team and stop being tracked."
        details={[
          removing?.device
            ? `Their device ${removing.device.serial_number} is freed, ready to give to someone else.`
            : "They have no device to free.",
          "A shift still open is closed at the last position their device sent.",
          "Hours, alerts and tasks they already have stay in History and on reports.",
        ]}
        confirmLabel="Remove employee"
        onConfirm={() => removing && remove(removing)}
      />

      <ConfirmDialog
        open={removingMany}
        onOpenChange={setRemovingMany}
        title={`Remove ${selected.size} employee${selected.size === 1 ? "" : "s"}?`}
        description="They leave the active team and stop being tracked."
        details={[
          "Any devices they hold are freed, ready to give to someone else.",
          "A shift still open is closed at the last position their device sent.",
          "Hours, alerts and tasks they already have stay in History and on reports.",
        ]}
        confirmLabel={`Remove ${selected.size}`}
        onConfirm={removeSelected}
      />

      {editing && (
        <EditEmployeeDialog
          key={editing.id}
          employee={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      {deviceFor && (
        <EmployeeDeviceDialog
          key={deviceFor.id}
          employee={deviceFor}
          onClose={() => setDeviceFor(null)}
          onChanged={load}
        />
      )}
      <AddEmployeeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={load}
        onImportClick={() => {
          setAddOpen(false);
          setImportOpen(true);
        }}
      />

      <ImportCsvDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={load}
      />
    </>
  );
}