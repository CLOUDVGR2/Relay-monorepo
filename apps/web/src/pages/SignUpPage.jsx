/** Page component for SignUpPage in the Relay web application. */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Command,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { Button } from "../components/ui";
import { Input } from "../components/ui";

export default function SignUpPage() {
  const { signup, isSigningUp } = useAuthStore();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAuthError("");
    const result = await signup({
      fullName: fullName.trim(),
      email: email.trim(),
      password,
    });
    setAuthError(typeof result === "string" ? result : "");
  };

  const passwordChecks = [
    { label: "At least 8 characters", valid: password.length >= 8 },
    { label: "Contains a letter and a number", valid: /[a-zA-Z]/.test(password) && /\d/.test(password) },
  ];

  return (
    <main id="main-content" tabIndex={-1} className="relative min-h-screen overflow-hidden bg-[#080b14] text-white selection:bg-blue-500/30">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_10%,rgba(59,130,246,0.22),transparent_42%),radial-gradient(ellipse_at_10%_90%,rgba(34,211,238,0.13),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col px-5 sm:px-8 lg:px-12">
        <header className="flex h-20 items-center justify-between">
          <Link to="/signup" className="group flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.06] shadow-[0_0_30px_rgba(59,130,246,0.14)] transition group-hover:border-blue-400/40">
              <Command size={21} className="text-blue-300" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Relay<span className="text-blue-300">.</span></span>
          </Link>
          <p className="text-xs text-slate-400">
            Already a member?{" "}
            <Link to="/login" className="font-semibold text-blue-300 transition hover:text-blue-200">
              Sign in
            </Link>
          </p>
        </header>

        <div className="grid flex-1 items-center gap-12 py-8 lg:grid-cols-[1fr_0.9fr] lg:gap-20 lg:py-12">
          <section className="mx-auto w-full max-w-xl lg:mx-0">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/[0.06] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.19em] text-sky-200">
              <Sparkles size={13} />
              Start building with clarity
            </div>

            <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-6xl xl:text-7xl">
              Make room
              <br />
              for <span className="bg-gradient-to-r from-blue-300 via-cyan-300 to-sky-300 bg-clip-text text-transparent">what&apos;s next.</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
              Bring your AI operations, workflows, and platform intelligence into one focused workspace.
            </p>

            <div className="mt-10 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5 backdrop-blur-xl">
                <span className="mb-4 grid size-10 place-items-center rounded-xl bg-blue-400/10 text-blue-300">
                  <Sparkles size={19} />
                </span>
                <h3 className="text-sm font-semibold">One clear picture</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">Bring the signals that matter into focus.</p>
              </div>
              <div className="rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5 backdrop-blur-xl">
                <span className="mb-4 grid size-10 place-items-center rounded-xl bg-sky-400/10 text-sky-300">
                  <ShieldCheck size={19} />
                </span>
                <h3 className="text-sm font-semibold">Your workspace</h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">A dedicated entry point to your platform.</p>
              </div>
            </div>

            <div className="mt-8 hidden items-center gap-3 text-xs text-slate-300 sm:flex">
              <div className="flex -space-x-2">
                <span className="grid size-7 place-items-center rounded-full border-2 border-[#080b14] bg-blue-500/30 text-[9px] text-blue-100">AI</span>
                <span className="grid size-7 place-items-center rounded-full border-2 border-[#080b14] bg-blue-500/30 text-[9px] text-blue-100">OPS</span>
                <span className="grid size-7 place-items-center rounded-full border-2 border-[#080b14] bg-indigo-500/30 text-[9px] text-indigo-100">DX</span>
              </div>
              Designed for people building what&apos;s next.
            </div>
          </section>

          <section className="mx-auto w-full max-w-[440px] lg:mx-0 lg:justify-self-end">
            <div className="rounded-[28px] border border-white/[0.12] bg-[#111522]/90 p-6 shadow-[0_25px_100px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition duration-300 hover:border-blue-300/20 sm:p-9">
              <div className="mb-7">
                <div className="mb-5 grid size-12 place-items-center rounded-2xl border border-blue-300/20 bg-gradient-to-br from-blue-400/20 to-blue-400/10 text-blue-200">
                  <UserRound size={23} />
                </div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-300">
                  Create your account
                </p>
                <h2 className="text-3xl font-semibold tracking-tight">Your next chapter.</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Set up your Relay workspace in a few steps.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {authError && (
                  <p
                    id="signup-form-error"
                    role="alert"
                    aria-live="assertive"
                    aria-atomic="true"
                    className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-200"
                  >
                    {authError}
                  </p>
                )}
                <div>
                  <label htmlFor="signup-name" className="mb-2 block text-xs font-medium text-slate-300">
                    Full name
                  </label>
                  <div className="group flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 transition focus-within:border-blue-400/70 focus-within:ring-4 focus-within:ring-blue-400/10">
                    <UserRound size={17} className="shrink-0 text-slate-500 transition group-focus-within:text-blue-300" />
                    <Input
                      unstyled
                      wrapperClassName="min-w-0 flex-1"
                      fieldClassName="h-full w-full"
                      id="signup-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Your full name"
                      value={fullName}
                      onChange={(event) => { setFullName(event.target.value); setAuthError(""); }}
                      required
                      minLength={2}
                      className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="signup-email" className="mb-2 block text-xs font-medium text-slate-300">
                    Work email
                  </label>
                  <div className="group flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 transition focus-within:border-blue-400/70 focus-within:ring-4 focus-within:ring-blue-400/10">
                    <Mail size={17} className="shrink-0 text-slate-500 transition group-focus-within:text-blue-300" />
                    <Input
                      unstyled
                      wrapperClassName="min-w-0 flex-1"
                      fieldClassName="h-full w-full"
                      id="signup-email"
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
                  <label htmlFor="signup-password" className="mb-2 block text-xs font-medium text-slate-300">
                    Create password
                  </label>
                  <div className="group flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3.5 transition focus-within:border-blue-400/70 focus-within:ring-4 focus-within:ring-blue-400/10">
                    <LockKeyhole size={17} className="shrink-0 text-slate-500 transition group-focus-within:text-blue-300" />
                    <Input
                      unstyled
                      wrapperClassName="min-w-0 flex-1"
                      fieldClassName="h-full w-full"
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      value={password}
                      onChange={(event) => { setPassword(event.target.value); setAuthError(""); }}
                      required
                      minLength={8}
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
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {passwordChecks.map(({ label, valid }) => (
                      <p key={label} className={`flex items-center gap-1.5 text-[10px] ${valid ? "text-emerald-300" : "text-slate-300"}`}>
                        <Check size={12} />
                        {label}
                      </p>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  loading={isSigningUp}
                  disabled={isSigningUp}
                  rightIcon={
                    !isSigningUp ? (
                      <ArrowRight
                        size={17}
                        className="transition group-hover:translate-x-1"
                      />
                    ) : null
                  }
                  className="group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl border-0 bg-gradient-to-r from-blue-700 to-blue-500 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(59,130,246,0.22)] transition hover:brightness-110 hover:shadow-[0_8px_38px_rgba(34,211,238,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111522] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSigningUp ? "Creating your account…" : "Create your account"}
                </Button>
              </form>

              <p className="mt-6 text-center text-xs text-slate-400">
                Already have an account?{" "}
                <Link to="/login" className="font-semibold text-blue-300 transition hover:text-blue-200">
                  Sign in
                </Link>
              </p>

              <p className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-300">
                <ShieldCheck size={13} />
                Your account is managed by the Relay authentication service.
              </p>
            </div>
          </section>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/[0.07] py-5 text-[10px] text-slate-300 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Relay. Built for what&apos;s next.</span>
          <span>AI operations · Intelligence · Workflows</span>
        </footer>
      </div>
    </main>
  );
}
