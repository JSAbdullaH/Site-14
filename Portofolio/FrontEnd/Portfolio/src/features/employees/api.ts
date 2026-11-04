import { apiFetch } from "@/shared/lib/api";
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeStatus,
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
import { apiBlob } from "@/shared/lib/api";
import type { ImportPreviewResponse, ImportCommitResponse } from "./types";

export const downloadImportTemplate = () =>
  apiBlob("/employees/import/template");

export function previewImport(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<ImportPreviewResponse>("/employees/import/preview", {
    method: "POST",
    body,
  });
}

export function commitImport(file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<ImportCommitResponse>("/employees/import", {
    method: "POST",
    body,
  });
}