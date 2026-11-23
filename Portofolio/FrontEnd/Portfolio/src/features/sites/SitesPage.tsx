import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map as MapIcon, MoreHorizontal, Pencil, Plus, Power, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/shared/components/AppShell";
import EmptyState from "@/shared/components/EmptyState";
import StatusBadge from "@/shared/components/StatusBadge";
import { isAdmin } from "@/shared/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DeactivateSiteDialog from "./components/DeactivateSiteDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listSites, setActiveSiteId, updateSite } from "./api";
import { shiftLabel } from "./types";
import type { SiteSummary } from "./types";

// SITE-47, SITE-48: every project site of the company, running side by side.
export default function SitesPage() {
  const navigate = useNavigate();
  const admin = isAdmin();

  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState<SiteSummary | null>(null);

  const replace = (next: SiteSummary) => setSites((prev) => prev.map((s) => (s.id === next.id ? { ...s, ...next } : s)));

  async function reactivate(site: SiteSummary) {
    setError("");
    try {
      replace(await updateSite(site.id, { is_active: true }));
      toast.success(`${site.name} is active again`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    listSites()
      .then((res) => setSites(res.data))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function openOnMap(site: SiteSummary) {
    setActiveSiteId(site.id);
    navigate("/home");
  }

  const activeCount = sites.filter((s) => s.is_active).length;

  return (
    <AppShell
      title="Sites"
      subtitle={
        loading
          ? "Where your crews work"
          : `${activeCount} active site${activeCount === 1 ? "" : "s"}`
      }
    >
      {error && (
        <p className="mb-5 rounded-md bg-warn-bg px-4 py-3 text-sm font-medium text-warn">
          {error}
        </p>
      )}

      {admin && sites.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => navigate("/sites/new")}>
            <Plus />
            New site
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description={
            admin
              ? "A site is one project: its perimeter, its shift, and the workers assigned to it."
              : "Ask your administrator to create a site."
          }
          action={
            admin ? (
              <Button onClick={() => navigate("/sites/new")}>Create a site</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>On site now</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>

            <TableBody>
              {sites.map((site) => (
                <TableRow
                  key={site.id}
                  className={`${admin ? "cursor-pointer" : ""} ${site.is_active ? "" : "text-muted-foreground"}`}
                  onClick={admin ? () => navigate(`/sites/${site.id}`) : undefined}
                >
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {site.display_id}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{site.name}</span>
                    {site.client && (
                      <span className="block text-xs text-muted-foreground">
                        {site.client}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{shiftLabel(site)}</TableCell>
                  <TableCell className="tabular-nums">
                    {site.employee_count}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {site.on_site_count}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={site.is_active ? "ok" : "neutral"}>
                      {site.is_active ? "Active" : "Deactivated"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {site.is_active && (
                        <Button variant="ghost" size="sm" onClick={() => openOnMap(site)}>
                          <MapIcon />
                          Open map
                        </Button>
                      )}
                      {admin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${site.name}`}
                            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-secondary"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-48">
                            <DropdownMenuItem onClick={() => navigate(`/sites/${site.id}`)}>
                              <Pencil />
                              Edit site
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {site.is_active ? (
                              <DropdownMenuItem variant="destructive" onClick={() => setClosing(site)}>
                                <Power />
                                Deactivate site
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => reactivate(site)}>
                                <RotateCcw />
                                Reactivate site
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DeactivateSiteDialog site={closing} onClose={() => setClosing(null)} onDeactivated={replace} />

      <p className="mt-4 text-sm text-muted-foreground">
        Zones are drawn on the live map. Open a site's map to add or edit its zones.
      </p>
    </AppShell>
  );
}
