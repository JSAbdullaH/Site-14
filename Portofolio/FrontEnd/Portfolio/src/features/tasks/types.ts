export type TaskStatus = "todo" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  scheduled_for: string;
  completed_at: string | null;
  created_at: string;
  site: { id: string; name: string };
  employee: { id: string; full_name: string };
  created_by: { id: string; full_name: string };
};

export type ListTasksResponse = {
  data: Task[];
  page: number;
  limit: number;
  total: number;
};

export type CreateTaskInput = {
  title: string;
  employee_id: string;
  site_id?: string;
  scheduled_for?: string;
};

export type TaskFilters = {
  siteId?: string;
  employeeId?: string;
  status?: TaskStatus;
  scheduledFor?: string;
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const STATUS_TONE: Record<TaskStatus, "neutral" | "info" | "ok"> = {
  todo: "neutral",
  in_progress: "info",
  done: "ok",
};

export function todayInRiyadh(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
}
