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
