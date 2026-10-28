import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "@/shared/lib/api";
import { clearToken } from "@/shared/lib/auth";

const MAIN = [
  { to: "/home", label: "Map" },
  { to: "/sites", label: "Sites & Zones" },
  { to: "/tasks", label: "Tasks" },
  { to: "/team", label: "Team" },
  { to: "/employees", label: "Employees" },
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

export default function AppShell({ title, subtitle, children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

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
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        className={`flex items-center h-10 px-4 rounded-ctrl text-sm font-bold transition-colors ${
          active ? "bg-ink text-white" : "text-ink hover:bg-sand"
        }`}
      >
        {label}
      </Link>
    );
  }

  return (
    <div className="min-h-screen bg-page flex">
      <aside className="w-64 shrink-0 bg-bone flex flex-col px-4 py-6">
        <span className="px-4 text-lg font-bold tracking-tight mb-8">SITE14</span>

        <p className="px-4 mb-2 text-[11px] font-bold tracking-[0.14em] text-mute2">MAIN</p>
        <nav className="flex flex-col gap-1 mb-7">
          {MAIN.map((item) => <NavLink key={item.to} {...item} />)}
        </nav>

        <p className="px-4 mb-2 text-[11px] font-bold tracking-[0.14em] text-mute2">RECORDS</p>
        <nav className="flex flex-col gap-1">
          {RECORDS.map((item) => <NavLink key={item.to} {...item} />)}
        </nav>

        <div className="mt-auto pt-6">
          <Link
            to="/account"
            className="flex items-center gap-3 px-4 h-12 rounded-ctrl hover:bg-sand transition-colors"
          >
            <span className="w-8 h-8 shrink-0 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center">
              LK
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold truncate">Account</span>
              <span className="block text-[11px] text-mute2 font-semibold">Company settings</span>
            </span>
          </Link>

          <button
            onClick={logout}
            className="mt-1 w-full text-left px-4 h-10 rounded-ctrl text-sm font-bold text-muted-foreground-foreground hover:bg-sand hover:text-signal transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 shrink-0 flex items-center px-8 border-b border-sand2">
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{title}</h1>
            {subtitle && (
              <p className="text-[13px] text-muted-foreground-foreground font-semibold truncate">{subtitle}</p>
            )}
          </div>
        </header>

        <main className="flex-1 p-8 min-w-0">{children}</main>
      </div>
    </div>
  );
}