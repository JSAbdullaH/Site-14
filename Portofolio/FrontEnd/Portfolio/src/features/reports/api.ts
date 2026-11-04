import { ApiError, apiFetch, apiRaw } from "@/shared/lib/api";
import type { GeneratedReport, ReportType, ReportVerification } from "./types";

export async function generateReport(params: {
  siteId: string;
  reportType: ReportType;
  from: string;
  to: string;
}): Promise<GeneratedReport> {
  const query = new URLSearchParams({
    site_id: params.siteId,
    report_type: params.reportType,
    from: params.from,
    to: params.to,
  });

  const res = await apiRaw(`/reports?${query.toString()}`);

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      data?.error?.message || "Could not generate the report.",
      data?.error?.code,
    );
  }

  const reference = res.headers.get("X-Report-Reference") ?? "";
  return { reference, filename: `${reference || "report"}.pdf`, blob: await res.blob() };
}

export const verifyReport = (reference: string) =>
  apiFetch<ReportVerification>(`/reports/verify/${encodeURIComponent(reference)}`);
