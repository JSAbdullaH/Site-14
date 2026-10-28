export type EmployeeStatus = "active" | "inactive";

export type Employee = {
  id: string;
  full_name: string;
  job_category: string;
  status: EmployeeStatus;
  site_id: string | null;
  site_name?: string | null;
  device?: { id: string; serial_number: string } | null;
  consent_given_at?: string | null;
};

export type ListEmployeesResponse = {
  data: Employee[];
};

export type CreateEmployeeInput = {
  full_name: string;
  job_category: string;
  site_id: string;
};
