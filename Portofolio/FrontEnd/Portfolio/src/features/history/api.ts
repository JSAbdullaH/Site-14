import { apiFetch } from "@/shared/lib/api";
import type { DailyRecord } from "./types";

// GET /employees/:id/daily-record
export const getDailyRecord = (employeeId: string, date: string) =>
  apiFetch<DailyRecord>(`/employees/${employeeId}/daily-record?date=${date}`);
