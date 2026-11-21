import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  Building2,
  FileText,
  History,
  ListChecks,
  LogOut,
  Map as MapIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
  Store,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "@/shared/lib/api";
import { clearToken, getUser } from "@/shared/lib/auth";
import { useAlertFeed } from "@/shared/lib/useAlertFeed";
import { Toaster } from "@/components/ui/sonner";
import NotificationBell from "./NotificationBell";

type NavItem = { to: string; label: string; icon: LucideIcon; soon?: boolean; badge?: number };

const MAIN: NavItem[] = [
  { to: "/home", label: "Map", icon: MapIcon },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/sites", label: "Sites & Zones", icon: Building2 },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/team", label: "Team", icon: Users },
];

const RECORDS: NavItem[] = [
  { to: "/devices", label: "Devices", icon: Smartphone },
  { to: "/marketplace", label: "Marketplace", icon: Store },
  { to: "/history", label: "History", icon: History },
  { to: "/reports", label: "Reports", icon: FileText },
];

const SIDEBAR_KEY = "site14_sidebar";

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
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "collapsed";
    } catch {
      return false;
    }
  });

  const hideOnRail = collapsed ? "md:hidden" : "";
  const centerOnRail = collapsed ? "md:justify-center md:px-0" : "";

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
    } catch {
      return;
    }
  }, [collapsed]);

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => undefined);
    clearToken();
    navigate("/signin", { replace: true });
  }

  function NavLink({ to, label, icon: Icon, soon, badge }: NavItem) {
    if (soon) {
      return (
        <span
          aria-disabled="true"
          title={collapsed ? label : undefined}
          className={`flex h-10 cursor-default items-center gap-3 rounded-md px-4 text-sm font-medium text-muted-foreground ${centerOnRail}`}
        >
          <Icon className="size-[18px] shrink-0" />
          <span className={`flex-1 truncate ${hideOnRail}`}>{label}</span>
          <span className={`text-[10px] font-semibold tracking-wide uppercase ${hideOnRail}`}>Soon</span>
        </span>
      );
    }

    const active = location.pathname === to || location.pathname.startsWith(`${to}/`);

    return (
      <Link
        to={to}
        title={collapsed ? label : undefined}
        aria-label={collapsed ? label : undefined}
        className={`relative flex h-10 items-center gap-3 rounded-md px-4 text-sm font-medium transition-colors ${centerOnRail} ${
          active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent"
        }`}
      >
        <Icon className="size-[18px] shrink-0" />
        <span className={`flex-1 truncate ${hideOnRail}`}>{label}</span>
        {badge ? (
          <span
            aria-label={`${badge} open`}
            className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums ${
              collapsed ? "md:absolute md:top-0.5 md:right-1 md:min-w-4 md:px-1 md:text-[10px]" : ""
            } ${active ? "bg-primary-foreground text-primary" : "bg-danger text-white"}`}
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r bg-sidebar px-4 py-6 transition-[transform,width] duration-200 md:sticky md:top-0 md:h-svh md:translate-x-0 ${
          collapsed ? "md:w-[72px] md:px-3" : "md:w-64"
        } ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className={`mb-8 flex items-center justify-between gap-2 px-4 ${centerOnRail}`}>
          <span className={`text-lg font-semibold tracking-tight ${hideOnRail}`}>SITE14</span>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground md:inline-flex"
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
        </div>

        <p className={`mb-2 px-4 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground ${hideOnRail}`}>
          MAIN
        </p>
        <nav className="mb-7 flex flex-col gap-1">
          {MAIN.map((item) => (
            <NavLink key={item.to} {...item} badge={item.to === "/alerts" ? openAlerts : undefined} />
          ))}
        </nav>

        <p className={`mb-2 px-4 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground ${hideOnRail}`}>
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
            title={collapsed ? (user?.full_name ?? "Account") : undefined}
            className={`flex h-12 items-center gap-3 rounded-md px-4 transition-colors hover:bg-sidebar-accent ${centerOnRail}`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials(user?.full_name)}
            </span>
            <span className={`min-w-0 ${hideOnRail}`}>
              <span className="block truncate text-sm font-medium">{user?.full_name ?? "Account"}</span>
              <span className="block text-[11px] text-muted-foreground">Company settings</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={logout}
            title={collapsed ? "Sign out" : undefined}
            aria-label={collapsed ? "Sign out" : undefined}
            className={`mt-1 flex h-10 w-full items-center gap-3 rounded-md px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive ${centerOnRail}`}
          >
            <LogOut className="size-[18px] shrink-0" />
            <span className={hideOnRail}>Sign out</span>
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
            {subtitle && <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
          <NotificationBell events={feed.events} unread={feed.unread} capped={feed.capped} onOpen={feed.markRead} />
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}
