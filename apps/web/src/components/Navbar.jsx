/** UI component for Navbar in the Relay web application. */

import { Link, NavLink } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";
import {
  Activity,
  Command,
  LogOut,
  MessageCircle,
  Settings,
  Sparkles,
  User,
} from "lucide-react";

const navClass = ({ isActive }) =>
  `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
    isActive
      ? "bg-primary/10 text-primary"
      : "text-base-content/60 hover:bg-base-200 hover:text-base-content"
  }`;

const Navbar = () => {
  const { logout, authUser } = useAuthStore();

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-base-300/80 bg-base-100/90 text-base-content shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-5 lg:px-8">
        <Link
          to="/"
          aria-label="Relay home"
          className="flex shrink-0 items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-content shadow-sm">
            <Command className="size-5 text-blue-300" aria-hidden="true" />
          </span>
          <span className="text-xl font-bold tracking-tight">Relay<span className="text-blue-300">.</span></span>
          <span className="ml-1 hidden rounded-md border border-base-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-base-content/45 xl:inline">
            Intelligence
          </span>
        </Link>

        <nav aria-label="Main navigation" className="flex items-center gap-1">
          {authUser && (
            <>
              <NavLink to="/" end className={navClass} title="Messages">
                <MessageCircle size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Chat</span>
              </NavLink>
              <NavLink to="/intelligence" className={navClass} title="Intelligence dashboard">
                <Activity size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Intelligence</span>
              </NavLink>
            </>
          )}

          <Link
            to="/settings"
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-base-content/60 transition hover:bg-base-200 hover:text-base-content"
            aria-label="Settings"
          >
            <Settings size={16} aria-hidden="true" />
            <span className="hidden lg:inline">Settings</span>
          </Link>

          {authUser && (
            <>
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-base-content/60 transition hover:bg-base-200 hover:text-base-content"
                aria-label="Profile"
              >
                <User size={16} aria-hidden="true" />
                <span className="hidden lg:inline">Profile</span>
              </Link>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-base-300 px-3 py-2 text-sm font-medium transition hover:border-error/40 hover:bg-error/5 hover:text-error"
                onClick={logout}
                aria-label="Log out"
              >
                <LogOut size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </>
          )}
          {!authUser && (
            <Link to="/login" className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-content">
              <Sparkles size={15} aria-hidden="true" />
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
