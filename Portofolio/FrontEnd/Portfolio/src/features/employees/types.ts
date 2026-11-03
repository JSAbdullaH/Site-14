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

export type ImportField = "full_name" | "employee_number" | "job_category" | "site_name";

export type ColumnMap = Partial<Record<ImportField, string>>;

export type ImportPreview = {
  total_rows: number;
  valid_rows: {
    row: number;
    full_name: string;
    employee_number: string | null;
    job_category: string;
    site_name: string | null;
  }[];
  invalid_rows: { row: number; reason: string }[];
  duplicates: { row: number; employee_number: string; reason: string }[];
};

export type ImportResult = {
  created: number;
  skipped: { row: number; employee_number: string; reason: string }[];
  errors: { row: number; reason: string }[];
};
