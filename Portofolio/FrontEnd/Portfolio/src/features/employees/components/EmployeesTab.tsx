import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import EmptyState from "@/shared/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import EmployeeTable from "./EmployeeTable";
import AddEmployeeDialog from "./AddEmployeeDialog";
import ImportCsvDialog from "./ImportCsvDialog";
import EditEmployeeDialog from "./EditEmployeeDialog";
import EmployeeDeviceDialog from "./EmployeeDeviceDialog";
import { Upload } from "lucide-react";
import { isAdmin } from "@/shared/lib/auth";
import { listEmployees } from "../api";
import type { Employee } from "../types";

export default function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deviceFor, setDeviceFor] = useState<Employee | null>(null);
  const admin = isAdmin();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await listEmployees({ limit: 100 });
      setEmployees(res.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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

            <div className="mb-4 flex items-center justify-between gap-4">
        <Input
          placeholder="Search by name, job or number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload />
            Import CSV
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus />
            Add employee
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query ? "No matching employees" : "No employees yet"}
          description={
            query
              ? "Try a different name, job or number."
              : "Add your first field worker, or import a list from a CSV file."
          }
          action={
            !query ? (
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
        />
      )}

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