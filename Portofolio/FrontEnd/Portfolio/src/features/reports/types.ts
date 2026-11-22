export type ReportType = "daily" | "weekly" | "monthly";

export type GeneratedReport = {
  reference: string;
  filename: string;
  blob: Blob;
};

export type ReportVerification = {
  reference_number: string;
  report_type: ReportType;
  period_start: string;
  period_end: string;
  sha256: string;
  file_size_bytes: number;
  issued_at: string;
  issued_by: string;
  site: string;
  client: string | null;
};
