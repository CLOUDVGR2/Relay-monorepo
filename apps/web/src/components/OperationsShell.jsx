/** UI component for OperationsShell in the Relay web application. */

import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import { useThemeStore } from "../store/useThemeStore";
import {
  Activity,
  Bot,
  Boxes,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  Command,
  Database,
  LayoutDashboard,
  LogOut,
  Moon,
  Network,
  Settings,
  Sparkles,
  Sun,
  UserRound,
  Workflow,
} from "lucide-react";

const sections = [
  {
    label: "PLATFORM",
    items: [
      { label: "Overview", path: "/", icon: LayoutDashboard, end: true },
      { label: "Intelligence", path: "/intelligence", icon: Activity },
      { label: "AI runs", path: "/agents", icon: Bot },
      { label: "AI Assistant", path: "/ai", icon: Sparkles },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { label: "Infrastructure", path: "/infrastructure", icon: Network },
      { label: "Jobs & workflows", path: "/jobs", icon: Workflow },
      { label: "Analytics", path: "/analytics", icon: ChartNoAxesCombined },
      { label: "Knowledge", path: "/knowledge", icon: Database },
    ],
  },
];

const OperationsShell = () => {
  const { authUser, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const location = useLocation();

  const isDark = ["dark", "business", "night", "coffee", "dracula", "forest"].includes(theme);
  const displayName =
    authUser?.fullName ||
    authUser?.name ||
    authUser?.email ||
    "Workspace administrator";

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-base-200 text-base-content lg:flex-row">
      <aside className="hidden w-[250px] shrink-0 flex-col border-r border-base-300 bg-base-100 lg:flex">
        <NavLink to="/" className="flex h-[76px] items-center gap-3 border-b border-base-300 px-6">
          <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-content shadow-lg shadow-primary/20">
            <Command size={21} className="text-blue-300" />
          </span>
          <span>
            <span className="block text-lg font-bold tracking-tight">Relay<span className="text-blue-300">.</span></span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-base-content/80">
              AI operations
            </span>
          </span>
        </NavLink>

        <div className="flex-1 space-y-7 overflow-y-auto px-3 py-6">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.17em] text-base-content/80">
                {section.label}
              </p>
              <nav aria-label={section.label} className="space-y-1">
                {section.items.map(({ label, path, icon: Icon, end }) => (
                  <NavLink
                    key={path}
                    to={path}
                    end={end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl min-h-11 px-3 py-2.5 text-[13px] font-medium transition ${
                        isActive
                          ? "bg-primary/10 text-base-content"
                          : "text-base-content/80 hover:bg-base-200 hover:text-base-content"
                      }`
                    }
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span className="flex-1">{label}</span>
                    {location.pathname === path && (
                      <ChevronRight size={14} aria-hidden="true" />
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}

          <div>
            <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.17em] text-base-content/80">
              WORKSPACE
            </p>
            <nav className="space-y-1">
              <NavLink
                to="/workspace"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                    isActive
                      ? "bg-primary/10 text-base-content"
                      : "text-base-content/80 hover:bg-base-200 hover:text-base-content"
                  }`
                }
              >
                <Boxes size={17} strokeWidth={1.8} />
                Messaging workspace
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                    isActive
                      ? "bg-primary/10 text-base-content"
                      : "text-base-content/80 hover:bg-base-200 hover:text-base-content"
                  }`
                }
              >
                <Settings size={17} strokeWidth={1.8} />
                Settings
              </NavLink>
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                    isActive
                      ? "bg-primary/10 text-base-content"
                      : "text-base-content/80 hover:bg-base-200 hover:text-base-content"
                  }`
                }
              >
                <UserRound size={17} strokeWidth={1.8} />
                My profile
              </NavLink>
            </nav>
          </div>
        </div>

        <div className="border-t border-base-300 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-base-200/70 p-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              {String(displayName).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{displayName}</p>
              <p className="mt-0.5 text-[10px] text-base-content/80">Workspace account</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Log out"
              aria-label="Log out"
              className="rounded-lg p-2 text-base-content/80 transition hover:bg-error/10 hover:text-error"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-3 border-b border-base-300/80 bg-base-100/95 px-4 shadow-sm shadow-base-content/[0.03] backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <NavLink to="/" className="flex items-center gap-2 lg:hidden">
              <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-content shadow-md shadow-primary/20">
                <Command size={19} className="text-blue-300" />
              </span>
              <span className="font-bold">Relay<span className="text-blue-300">.</span></span>
            </NavLink>
            <span className="hidden h-5 w-px bg-base-300 lg:block" />
            <div className="min-w-0 py-2">
              <p className="mb-1 truncate text-[9px] font-bold uppercase tracking-[0.2em] text-base-content/45">Relay · Workspace</p>
              <p className="truncate text-[15px] font-semibold tracking-tight">
                {sections.flatMap((section) => section.items).find((item) =>
                  item.end ? location.pathname === item.path : location.pathname.startsWith(item.path)
                )?.label ||
                  (location.pathname === "/workspace"
                    ? "Messaging workspace"
                    : location.pathname === "/settings"
                      ? "Settings"
                      : location.pathname === "/profile"
                        ? "My profile"
                        : "Operations")}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span
              role="status"
              aria-label="Live health checks refresh every 30 seconds"
              className="hidden items-center gap-2.5 rounded-2xl border border-success/20 bg-success/[0.06] px-3.5 py-2 sm:flex"
            >
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/40" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold leading-none text-base-content">Live monitoring</span>
                <span className="text-[9px] font-medium tracking-wide text-base-content/50">Refreshes every 30 sec</span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
              title="Toggle theme"
              className="grid size-10 place-items-center rounded-xl border border-base-300/80 bg-base-100 text-base-content/70 transition hover:border-primary/30 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <NavLink
              to="/settings"
              aria-label="Settings"
              className="grid size-10 place-items-center rounded-xl border border-base-300/80 bg-base-100 text-base-content/70 transition hover:border-primary/30 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Settings size={17} />
            </NavLink>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-base-300 bg-base-100 px-3 py-2 lg:hidden" aria-label="Mobile navigation">
          {[...sections.flatMap((section) => section.items), { label: "Workspace", path: "/workspace", icon: Boxes }, { label: "Settings", path: "/settings", icon: Settings }, { label: "Profile", path: "/profile", icon: UserRound }].map(
            ({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-lg min-h-11 px-3 py-2 text-xs font-medium ${
                    isActive ? "bg-primary/10 text-base-content" : "text-base-content/80"
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            )
          )}
        </nav>

        <main id="main-content" tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>

        <footer className="flex items-center justify-between gap-3 border-t border-base-300 px-5 py-4 text-[10px] text-base-content/80 sm:px-8">
          <span>Relay · AI Operations Platform</span>
          <span className="flex items-center gap-1.5">
            <CircleHelp size={12} />
            Operational data requires connected endpoints
          </span>
        </footer>
      </div>
    </div>
  );
};

export default OperationsShell;
