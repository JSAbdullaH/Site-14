export type EmployeeStatus = "active" | "inactive";

export type Employee = {
  id: string;
  // The ID this system gives, like AI-E-100012. Fixed for good.
  display_id: string;
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

// Only the fields that change are sent. null clears the number or the site.
export type UpdateEmployeeInput = {
  full_name?: string;
  job_category?: string;
  employee_number?: string | null;
  site_id?: string | null;
  consent?: boolean;
};

export type DeviceOption = { id: string; serial_number: string };

// --- CSV import -------------------------------------------------------

export type ImportValidRow = {
  row: number;
  full_name: string;
  employee_number: string | null;
  job_category: string;
  site_name: string | null;
  // The ID the row will get if imported now. It moves on by one if someone adds an
  // employee in between, so the screen calls it expected.
  expected_worker_id: string;
};

export type ImportInvalidRow = { row: number; reason: string };

export type ImportDuplicateRow = {
  row: number;
  employee_number: string | null;
  // Set when the row was skipped because its worker ID is already on file.
  worker_id?: string;
  reason: string;
};

export type ImportUncheckedRow = {
  row: number;
  full_name: string;
  warning: string | null;
};

export type ImportPreviewResponse = {
  total_rows: number;
  valid_rows: ImportValidRow[];
  invalid_rows: ImportInvalidRow[];
  duplicates: ImportDuplicateRow[];
  unchecked_rows: ImportUncheckedRow[];
};

export type ImportedEmployee = {
  row: number;
  worker_id: string;
  full_name: string;
  employee_number: string | null;
  job_category: string;
  site_name: string | null;
};

export type ImportCommitResponse = {
  created: number;
  employees: ImportedEmployee[];
  skipped: ImportDuplicateRow[];
  errors: ImportInvalidRow[];
};