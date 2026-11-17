import { toast } from "sonner";
import ConfirmDialog from "@/shared/components/ConfirmDialog";
import { deactivateSite } from "../api";
import type { SiteSummary } from "../types";

type Props = {
  site: SiteSummary | null;
  onClose: () => void;
  onDeactivated: (site: SiteSummary) => void;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Sites are deactivated, never deleted: their shifts, tasks and issued reports point at them.
export default function DeactivateSiteDialog({ site, onClose, onDeactivated }: Props) {
  // The server refuses these two cases; say so before the click instead of after it.
  const blockedReason = !site
    ? undefined
    : site.on_site_count > 0
      ? `${plural(site.on_site_count, "worker is", "workers are")} on this site right now. Deactivate it after the shift ends.`
      : site.employee_count > 0
        ? `${plural(site.employee_count, "employee is", "employees are")} still assigned to this site. Move them to another site first, from the site page or the Team page.`
        : undefined;

  async function deactivate() {
    if (!site) return;
    await deactivateSite(site.id);
    toast.success(`${site.name} deactivated`, { description: "Its records and reports are kept." });
    onDeactivated({ ...site, is_active: false });
  }

  return (
    <ConfirmDialog
      open={site !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Deactivate ${site?.name ?? "this site"}?`}
      description="The site is closed: it leaves the live map, and no new tasks or devices can be given for it."
      details={[
        "Its zones, recorded shifts, tasks and issued reports are kept.",
        "You can still issue reports for the time it was open.",
        "You can reactivate it at any time from its page.",
      ]}
      confirmLabel="Deactivate site"
      blockedReason={blockedReason}
      onConfirm={deactivate}
    />
  );
}
