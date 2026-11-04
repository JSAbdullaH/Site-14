import { apiFetch } from "@/shared/lib/api";
import type { CreateTaskInput, ListTasksResponse, Task, TaskFilters, TaskStatus } from "./types";

export function listTasks(filters: TaskFilters = {}) {
  const query = new URLSearchParams();
  if (filters.siteId) query.set("site_id", filters.siteId);
  if (filters.employeeId) query.set("employee_id", filters.employeeId);
  if (filters.status) query.set("status", filters.status);
  if (filters.scheduledFor) query.set("scheduled_for", filters.scheduledFor);
  query.set("limit", "100");
  return apiFetch<ListTasksResponse>(`/tasks?${query.toString()}`);
}

export const createTask = (body: CreateTaskInput) =>
  apiFetch<Task>("/tasks", { method: "POST", body: JSON.stringify(body) });

export const updateTaskStatus = (id: string, status: TaskStatus) =>
  apiFetch<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
