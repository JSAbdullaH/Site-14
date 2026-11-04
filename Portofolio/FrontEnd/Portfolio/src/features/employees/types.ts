export type EmployeeStatus = "active" | "inactive";

export type Employee = {
  id: string;
  full_name: string;
  employee_number?: string | null;
  job_category: string;
  status: EmployeeStatus;
  site_id: string | null;
  site_name?: string | null;
  device?: { id: string; serial_number: string } | null;
  consent_given_at?: string | null;
};

export type ListEmployeesResponse = {
  data: Employee[];
  page: number;
  limit: number;
  total: number;
};

export type CreateEmployeeInput = {
  full_name: string;
  job_category: string;
  employee_number?: string | null;
  site_id?: string | null;
  consent?: boolean;
};

// --- CSV import -------------------------------------------------------

export type ImportValidRow = {
  row: number;
  full_name: string;
  employee_number: string | null;
  job_category: string;
  site_name: string | null;
};

export type ImportInvalidRow = { row: number; reason: string };

export type ImportDuplicateRow = {
  row: number;
  employee_number: string;
  reason: string;
};

export type ImportPreviewResponse = {
  total_rows: number;
  valid_rows: ImportValidRow[];
  invalid_rows: ImportInvalidRow[];
  duplicates: ImportDuplicateRow[];
};

export type ImportCommitResponse = {
  created: number;
  skipped: ImportDuplicateRow[];
  errors: ImportInvalidRow[];
};