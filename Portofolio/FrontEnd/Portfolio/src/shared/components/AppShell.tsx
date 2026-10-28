import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "@/shared/lib/api";
import { clearToken, getUser } from "@/shared/lib/auth";

const MAIN = [
  { to: "/home", label: "Map" },
  { to: "/sites", label: "Sites & Zones" },
  { to: "/tasks", label: "Tasks" },
  { to: "/team", label: "Team" },
];

const RECORDS = [
  { to: "/devices", label: "Devices" },
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

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } catch {
      // the session is ending either way
    }
    clearToken();
    navigate("/signin", { replace: true });
  }

  function NavLink({ to, label }: { to: string; label: string }) {
    const active =
      location.pathname === to || location.pathname.startsWith(`${to}/`);

    return (
      <Link
        to={to}
        className={`flex h-10 items-center rounded-md px-4 text-sm font-medium transition-colors ${
          active
            ? "bg-primary text-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar px-4 py-6">
        <span className="mb-8 px-4 text-lg font-semibold tracking-tight">
          SITE14
        </span>

        <p className="mb-2 px-4 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
          MAIN
        </p>
        <nav className="mb-7 flex flex-col gap-1">
          {MAIN.map((item) => (
            <NavLink key={item.to} {...item} />
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
        <header className="flex h-20 shrink-0 items-center gap-6 border-b px-8">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {subtitle && (
              <p className="truncate text-[13px] text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}