import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "@/shared/lib/api";
import { clearToken, getUser } from "@/shared/lib/auth";
import { useAlertFeed } from "@/shared/lib/useAlertFeed";
import { Toaster } from "@/components/ui/sonner";
import NotificationBell from "./NotificationBell";

type NavItem = { to: string; label: string; soon?: boolean; badge?: number };

const MAIN: NavItem[] = [
  { to: "/home", label: "Map" },
  { to: "/alerts", label: "Alerts" },
  { to: "/sites", label: "Sites & Zones" },
  { to: "/tasks", label: "Tasks" },
  { to: "/team", label: "Team" },
];

const RECORDS: NavItem[] = [
  { to: "/devices", label: "Devices" },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/history", label: "History" },
  { to: "/reports", label: "Reports" },
];

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

function initials(name?: string) {
  if (!name) return "SI";
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function AppShell({ title, subtitle, children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();
  const feed = useAlertFeed();
  const openAlerts = feed.summary?.open ?? 0;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    clearToken();
    navigate("/signin", { replace: true });
  }

  function NavLink({ to, label, soon, badge }: NavItem) {
    if (soon) {
      return (
        <span
          aria-disabled="true"
          className="flex h-10 cursor-default items-center justify-between rounded-md px-4 text-sm font-medium text-muted-foreground"
        >
          {label}
          <span className="text-[10px] font-semibold tracking-wide uppercase">Soon</span>
        </span>
      );
    }

    const active =
      location.pathname === to || location.pathname.startsWith(`${to}/`);

    return (
      <Link
        to={to}
        className={`flex h-10 items-center justify-between rounded-md px-4 text-sm font-medium transition-colors ${
          active
            ? "bg-primary text-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent"
        }`}
      >
        {label}
        {badge ? (
          <span
            aria-label={`${badge} open`}
            className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums ${
              active ? "bg-primary-foreground text-primary" : "bg-danger text-white"
            }`}
          >
            {badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <div className="flex min-h-svh bg-background">
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-y-auto border-r bg-sidebar px-4 py-6 transition-transform duration-200 md:sticky md:top-0 md:h-svh md:translate-x-0 ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <span className="mb-8 px-4 text-lg font-semibold tracking-tight">
          SITE14
        </span>

        <p className="mb-2 px-4 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
          MAIN
        </p>
        <nav className="mb-7 flex flex-col gap-1">
          {MAIN.map((item) => (
            <NavLink key={item.to} {...item} badge={item.to === "/alerts" ? openAlerts : undefined} />
          ))}
        </nav>

        <p className="mb-2 px-4 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
          RECORDS
        </p>
        <nav className="flex flex-col gap-1">
          {RECORDS.map((item) => (
            <NavLink key={item.to} {...item} />
          ))}
        </nav>

        <div className="mt-auto pt-6">
          <Link
            to="/account"
            className="flex h-12 items-center gap-3 rounded-md px-4 transition-colors hover:bg-sidebar-accent"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials(user?.full_name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {user?.full_name ?? "Account"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Company settings
              </span>
            </span>
          </Link>

          <button
            onClick={logout}
            className="mt-1 h-10 w-full rounded-md px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 md:h-20 md:gap-6 md:px-8">
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="-ml-1 inline-flex size-10 items-center justify-center rounded-md hover:bg-secondary md:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle && (
              <p className="truncate text-[13px] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          <NotificationBell events={feed.events} unread={feed.unread} capped={feed.capped} onOpen={feed.markRead} />
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}