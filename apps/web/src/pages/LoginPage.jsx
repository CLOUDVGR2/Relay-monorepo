/** Page component for LoginPage in the Relay web application. */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Command,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { Button } from "../components/ui";
import { Input } from "../components/ui";

export default function LoginPage() {
  const { login, isLoggingIn } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAuthError("");
    const result = await login({ email: email.trim(), password });
    setAuthError(typeof result === "string" ? result : "");
  };

  return (
    <main id="main-content" tabIndex={-1} className="relative min-h-screen overflow-hidden bg-[#080b14] text-white selection:bg-blue-500/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_15%,rgba(91,65,210,0.2),transparent_42%),radial-gradient(ellipse_at_90%_85%,rgba(30,130,230,0.14),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-5 sm:px-8 lg:px-12">
        <header className="flex h-20 items-center justify-between">
          <Link to="/login" className="group flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.06] shadow-[0_0_30px_rgba(59,130,246,0.14)] transition group-hover:border-blue-400/40">
              <Command size={21} className="text-blue-300" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Relay<span className="text-blue-300">.</span></span>
          </Link>
          <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
            <ShieldCheck size={15} className="text-emerald-400" />
            Secure workspace access
          </div>
        </header>

        <div className="grid flex-1 items-center gap-14 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-14">
          <section className="mx-auto w-full max-w-xl lg:mx-0">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/[0.07] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-blue-200">
              <Sparkles size={13} />
              Intelligence, in command
            </div>

            <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-6xl xl:text-7xl">
              Your platform.
              <br />
              <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-sky-300 bg-clip-text text-transparent">
                Your perspective.
              </span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
              One intelligent workspace for your operations, AI workflows, and the systems that power what comes next.
            </p>

            <div className="mt-10 hidden space-y-4 sm:block">
              {[
                "A unified operational workspace",
                "Your AI and workflow tools, together",
                "Designed for clarity at every scale",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                  <CheckCircle2 size={17} className="shrink-0 text-blue-300" />
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-12 hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5 backdrop-blur-xl sm:block">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Activity size={15} className="text-blue-300" />
                  Built for operational clarity
                </div>
                <span className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] uppercase tracking-wider text-slate-300">
                  Relay platform
                </span>
              </div>
              <div className="mt-5 flex h-16 items-end gap-1.5 overflow-hidden">
                {[25, 38, 30, 54, 42, 67, 45, 57, 77, 49, 64, 88, 59, 72, 95, 68, 80, 58, 75, 100, 72, 86, 63, 91, 77, 97, 68, 82].map((height, index) => (
                  <span
                    key={index}
                    className="min-w-1 flex-1 rounded-t-sm bg-gradient-to-t from-blue-600/20 to-blue-300/80"
                    style={{ height: `${height}%`, opacity: 0.35 + (height / 100) * 0.65 }}
                  />
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-300">
                Illustrative interface artwork · Not live telemetry
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-[440px] lg:mx-0 lg:justify-self-end">
            <div className="rounded-[28px] border border-white/[0.12] bg-[#111522]/90 p-6 shadow-[0_25px_100px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition duration-300 hover:border-blue-300/20 sm:p-9">
              <div className="mb-8">
                <div className="mb-6 grid size-12 place-items-center rounded-2xl border border-blue-300/20 bg-gradient-to-br from-blue-400/20 to-blue-400/10 text-blue-200">
                  <Fingerprint size={24} />
                </div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">
                  Welcome back
                </p>
                <h2 className="text-3xl font-semibold tracking-tight">Sign in to Relay</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Pick up where your work left off.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {authError && (
                  <p
                    id="login-form-error"
                    role="alert"
                    aria-live="assertive"
                    aria-atomic="true"
                    className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-200"
                  >
                    {authError}
                  </p>
                )}
                <div>
                  <label htmlFor="login-email" className="mb-2 block text-xs font-medium text-slate-300">
                    Email address
                  </label>
                  <div className="group flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 transition focus-within:border-blue-400/70 focus-within:ring-4 focus-within:ring-blue-400/10">
                    <Mail size={17} className="shrink-0 text-slate-500 transition group-focus-within:text-blue-300" />
                    <Input
                      unstyled
                      wrapperClassName="min-w-0 flex-1"
                      fieldClassName="h-full w-full"
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(event) => { setEmail(event.target.value); setAuthError(""); }}
                      required
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label htmlFor="login-password" className="text-xs font-medium text-slate-300">
                      Password
                    </label>
                  </div>
                  <div className="group flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 transition focus-within:border-blue-400/70 focus-within:ring-4 focus-within:ring-blue-400/10">
                    <LockKeyhole size={17} className="shrink-0 text-slate-500 transition group-focus-within:text-blue-300" />
                    <Input
                      unstyled
                      wrapperClassName="min-w-0 flex-1"
                      fieldClassName="h-full w-full"
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => { setPassword(event.target.value); setAuthError(""); }}
                      required
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="rounded-md p-1 text-slate-500 transition hover:text-white"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  loading={isLoggingIn}
                  disabled={isLoggingIn}
                  rightIcon={
                    !isLoggingIn ? (
                      <ArrowRight
                        size={17}
                        className="transition group-hover:translate-x-1"
                      />
                    ) : null
                  }
                  className="group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-blue-700 to-blue-500 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(23,70,162,0.28)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111522] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoggingIn ? "Signing you in…" : "Enter your workspace"}
                </Button>
              </form>

              <div className="my-7 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/[0.08]" />
                <span className="text-[10px] uppercase tracking-wider text-slate-300">New to Relay?</span>
                <span className="h-px flex-1 bg-white/[0.08]" />
              </div>

              <Link
                to="/signup"
                className="flex h-12 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.025] text-sm font-medium text-slate-200 transition hover:border-blue-400/40 hover:bg-blue-400/[0.06]"
              >
                Create your account
              </Link>

              <p className="mt-7 text-center text-[10px] leading-5 text-slate-300">
                Secure access to your Relay workspace.
                <br />
                Only sign in on a device you trust.
              </p>
            </div>
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/[0.07] py-5 text-[10px] text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Relay. Built for what&apos;s next.</span>
          <span className="flex items-center gap-2">
            <ShieldCheck size={13} />
            Authentication protected by your workspace API
          </span>
        </footer>
      </div>
    </main>
  );
}
