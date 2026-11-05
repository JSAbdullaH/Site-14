import type { Polygon } from "@/features/map/types";

export type Zone = { id: string; name: string; is_outdoor?: boolean };

export type CorrectableField = "first_seen" | "last_seen" | "worked_minutes";

export type AttendanceValue<T> = {
  original: T;
  value: T;
  corrected: boolean;
};

export type Correction = {
  id: string;
  field: CorrectableField;
  original_value: string;
  corrected_value: string;
  reason: string;
  site: { id: string; name: string };
  corrected_by: { id: string; full_name: string };
  created_at: string;
};

export type RecordAlert = {
  id: string;
  type: "zone_exit" | "hour_limit" | "midday_ban" | "heart_rate_high" | "heart_rate_low";
  triggered_at: string;
  zone: Zone | null;
  limit_minutes: number | null;
  observed_minutes: number | null;
  limit_bpm: number | null;
  observed_bpm: number | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

export type RecordTask = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  completed_at: string | null;
};

export type DailyRecord = {
  employee: { id: string; full_name: string; employee_number: string | null; job_category: string };
  date: string;
  status: "present" | "absent";
  is_provisional: boolean;
  has_corrections: boolean;
  sites: { id: string; name: string }[];
  session_count: number;
  attendance: {
    first_seen: AttendanceValue<string | null>;
    last_seen: AttendanceValue<string | null>;
    worked_minutes: AttendanceValue<number>;
  };
  minutes_by_zone: { zone: Zone | null; minutes: number }[];
  offline_minutes: number;
  alerts: RecordAlert[];
  tasks: RecordTask[];
  corrections: Correction[];
};

export type HistoryEvent = {
  type: "arrived" | "entered_zone" | "left_zone" | "offline" | "back_online" | "left_site";
  at: string;
  zone: { id: string; name: string } | null;
  site: string;
  minutes?: number;
};

export type HistoryPoint = {
  latitude: number;
  longitude: number;
  recorded_at: string;
  battery_percent: number | null;
  zone_id: string | null;
};

export type HistorySession = {
  session_id: string;
  site: { id: string; name: string };
  started_at: string;
  ended_at: string | null;
  points: HistoryPoint[];
  gaps: { from: string; to: string; minutes: number; until_end: boolean }[];
  events: HistoryEvent[];
};

export type MovementHistory = {
  employee_id: string;
  date: string;
  sites: { id: string; name: string; boundary: Polygon }[];
  zones: { id: string; site_id: string; name: string; is_outdoor: boolean; boundary: Polygon }[];
  sessions: HistorySession[];
};
