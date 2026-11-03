import { apiFetch, apiFile } from "@/shared/lib/api";
import type {
  ColumnMap,
  CreateEmployeeInput,
  Employee,
  EmployeeStatus,
  ImportPreview,
  ImportResult,
  ListEmployeesResponse,
} from "./types";

export function listEmployees(params?: {
  siteId?: string;
  status?: EmployeeStatus;
  search?: string;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.siteId) query.set("site_id", params.siteId);
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  return apiFetch<ListEmployeesResponse>(`/employees${qs ? `?${qs}` : ""}`);
}

export const createEmployee = (body: CreateEmployeeInput) =>
  apiFetch<Employee>("/employees", { method: "POST", body: JSON.stringify(body) });

export const updateEmployee = (
  id: string,
  body: Partial<Pick<Employee, "full_name" | "job_category" | "site_id">>,
) => apiFetch<Employee>(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(body) });

export const deactivateEmployee = (id: string) =>
  apiFetch<void>(`/employees/${id}`, { method: "DELETE" });

function csvForm(file: File, columnMap: ColumnMap) {
  const form = new FormData();
  form.append("file", file);
  if (Object.keys(columnMap).length) form.append("column_map", JSON.stringify(columnMap));
  return form;
}

// GET /employees/import/template
export const downloadTemplate = () => apiFile("/employees/import/template");

// POST /employees/import/preview
export const previewImport = (file: File, columnMap: ColumnMap) =>
  apiFetch<ImportPreview>("/employees/import/preview", { method: "POST", body: csvForm(file, columnMap) });

// POST /employees/import
export const commitImport = (file: File, columnMap: ColumnMap) =>
  apiFetch<ImportResult>("/employees/import", { method: "POST", body: csvForm(file, columnMap) });
