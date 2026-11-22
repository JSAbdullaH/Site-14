import { apiFetch } from "@/shared/lib/api";
import type { CorrectableField, Correction, DailyRecord, MovementHistory } from "./types";

// GET /employees/:id/daily-record
export const getDailyRecord = (employeeId: string, date: string) =>
  apiFetch<DailyRecord>(`/employees/${employeeId}/daily-record?date=${date}`);

// GET /employees/:id/history
export const getHistory = (employeeId: string, date: string) =>
  apiFetch<MovementHistory>(`/employees/${employeeId}/history?date=${date}`);

export type CorrectionInput = {
  date: string;
  field: CorrectableField;
  corrected_value: string;
  reason: string;
};

// POST /employees/:id/daily-record/corrections
export const addCorrection = (employeeId: string, body: CorrectionInput) =>
  apiFetch<Correction>(`/employees/${employeeId}/daily-record/corrections`, {
    method: "POST",
    body: JSON.stringify(body),
  });
