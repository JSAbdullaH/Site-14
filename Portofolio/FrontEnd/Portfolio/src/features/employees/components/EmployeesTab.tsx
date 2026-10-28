import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/shared/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import EmployeeTable from "./EmployeeTable";
import { listEmployees } from "../api";
import type { Employee } from "../types";

export default function EmployeesTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    listEmployees()
      .then((res) => setEmployees(res.data))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.job_category.toLowerCase().includes(q),
    );
  }, [employees, query]);

  return (
    <>
      {error && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          {error}
        </p>
      )}

      <div className="mb-4 max-w-sm">
        <Input
          placeholder="Search by name or job"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
              ? "Try a different name or job."
              : "Employees are added with their device and assigned to a site."
          }
        />
      ) : (
        <EmployeeTable employees={filtered} />
      )}
    </>
  );
}
