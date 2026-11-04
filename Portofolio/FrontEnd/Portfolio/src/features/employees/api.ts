import { apiFetch } from "@/shared/lib/api";
import type {
  CreateEmployeeInput,
  DeviceOption,
  Employee,
  EmployeeStatus,
  ListEmployeesResponse,
  UpdateEmployeeInput,
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

export const updateEmployee = (id: string, body: UpdateEmployeeInput) =>
  apiFetch<Employee>(`/employees/${id}`, { method: "PATCH", body: JSON.stringify(body) });

// --- the employee's device. Called here rather than from the devices feature,
// so the two features stay independent.

export const listFreeDevices = () =>
  apiFetch<{ data: DeviceOption[] }>("/devices?status=active&assigned=false&limit=100");

export const registerDevice = (serialNumber: string) =>
  apiFetch<DeviceOption & { api_key: string }>("/devices", {
    method: "POST",
    body: JSON.stringify({ serial_number: serialNumber }),
  });

export const assignDevice = (deviceId: string, employeeId: string | null) =>
  apiFetch<DeviceOption>(`/devices/${deviceId}`, {
    method: "PATCH",
    body: JSON.stringify({ employee_id: employeeId }),
  });

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