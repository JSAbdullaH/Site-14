import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
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
import { deactivateEmployee, listEmployees } from "../api";
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
        e.full_name.toLowerCase().includes(q) ||
        e.job_category.toLowerCase().includes(q) ||
        (e.employee_number ?? "").toLowerCase().includes(q),
    );
  }, [employees, query]);

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
            placeholder="Search by name, job or number"
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