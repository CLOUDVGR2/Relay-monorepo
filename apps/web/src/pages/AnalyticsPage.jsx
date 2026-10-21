/** Page component for AnalyticsPage in the Relay web application. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  TrendingUp,
  Workflow,
  XCircle,
} from "lucide-react";

const API_BASE_URL = (
  import.meta.env.VITE_NEST_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin)
).replace(/\/+$/, "");

const PERIODS = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "Latest 50", value: "all" },
];

const ACTIVE_STATUSES = new Set(["queued", "processing", "retrying"]);

function normalizeJobs(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return null;
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = validDate(value);
  if (!date) return "Unavailable";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusClasses(status) {
  switch (String(status || "").toLowerCase()) {
    case "completed":
      return "border-success/25 bg-success/10 text-success";
    case "failed":
      return "border-error/25 bg-error/10 text-error";
    case "processing":
      return "border-primary/25 bg-primary/10 text-primary";
    case "retrying":
      return "border-warning/25 bg-warning/10 text-warning";
    default:
      return "border-base-300 bg-base-200 text-base-content/70";
  }
}

function MetricCard({ label, value, detail, icon: Icon }) {
  return (
    <article className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-base-content/65">{label}</p>
        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon size={19} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-base-content/55">{detail}</p>
    </article>
  );
}

export default function AnalyticsPage() {
  const [jobs, setJobs] = useState([]);
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadJobs = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/jobs?limit=50`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        const messages = {
          401: "Your session may have expired. Sign in again to view analytics.",
          403: "You are not authorized to view these job records.",
          429: "Too many requests. Wait a moment before refreshing.",
          502: "The job-history service returned an invalid response.",
          503: "The job-history service is temporarily unavailable.",
        };

        throw new Error(
          messages[response.status] ||
            `Could not load job records (HTTP ${response.status}).`,
        );
      }

      const payload = await response.json();
      const records = normalizeJobs(payload);

      if (!records) {
        throw new Error("The API returned an unexpected job-history format.");
      }

      setJobs(
        records.filter(
          (job) =>
            job &&
            typeof job.id === "string" &&
            typeof job.status === "string",
        ),
      );
      setLastUpdated(new Date());
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Could not connect to the job-history API. Check the NestJS URL and server."
          : err.message || "Could not load analytics.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    const interval = window.setInterval(() => loadJobs(true), 30000);
    return () => window.clearInterval(interval);
  }, [loadJobs]);

  const filteredJobs = useMemo(() => {
    if (period === "all") return jobs;

    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (period === "7d") start.setDate(start.getDate() - 6);
    if (period === "30d") start.setDate(start.getDate() - 29);

    return jobs.filter((job) => {
      const created = validDate(job.createdAt);
      return created && created >= start && created <= now;
    });
  }, [jobs, period]);

  const metrics = useMemo(() => {
    const completed = filteredJobs.filter(
      (job) => job.status.toLowerCase() === "completed",
    ).length;
    const failed = filteredJobs.filter(
      (job) => job.status.toLowerCase() === "failed",
    ).length;
    const active = filteredJobs.filter((job) =>
      ACTIVE_STATUSES.has(job.status.toLowerCase()),
    ).length;
    const terminal = completed + failed;

    return {
      total: filteredJobs.length,
      completed,
      failed,
      active,
      successRate: terminal
        ? `${Math.round((completed / terminal) * 100)}%`
        : "—",
      successRateDetail: terminal
        ? `${terminal} completed or failed jobs`
        : "No terminal outcomes in this period",
    };
  }, [filteredJobs]);

  const activity = useMemo(() => {
    const now = new Date();
    const days = period === "today" ? 1 : period === "7d" ? 7 : 30;

    const buckets = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      buckets.push({
        key: dayKey(date),
        label:
          days === 1
            ? "Today"
            : new Intl.DateTimeFormat(undefined, {
                month: "short",
                day: "numeric",
              }).format(date),
        total: 0,
        completed: 0,
        failed: 0,
      });
    }

    const byDay = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    for (const job of filteredJobs) {
      const created = validDate(job.createdAt);
      if (!created) continue;

      const bucket = byDay.get(dayKey(created));
      if (!bucket) continue;

      bucket.total += 1;
      if (job.status.toLowerCase() === "completed") bucket.completed += 1;
      if (job.status.toLowerCase() === "failed") bucket.failed += 1;
    }

    return buckets;
  }, [filteredJobs, period]);

  const maxActivity = Math.max(1, ...activity.map((item) => item.total));

  return (
    <main className="mx-auto max-w-[1440px] space-y-7 px-4 py-7 text-base-content sm:px-6 lg:px-9 lg:py-10">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Platform insights
          </p>
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <Activity size={24} />
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
              <p className="mt-1 text-sm text-base-content/60">
                Measured background-job activity from your authenticated records.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadJobs(true)}
          disabled={loading || refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-semibold transition hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          Refresh data
        </button>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-base-300 bg-base-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Reporting period</h2>
          <p className="mt-1 text-xs text-base-content/55">
            Filters apply to job creation timestamps.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Analytics reporting period">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={period === item.value}
              onClick={() => setPeriod(item.value)}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition ${
                period === item.value
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-base-300 text-base-content/65 hover:bg-base-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <section role="alert" className="flex items-start gap-3 rounded-2xl border border-error/25 bg-error/5 p-4">
          <AlertCircle size={19} className="mt-0.5 shrink-0 text-error" />
          <div className="flex-1">
            <p className="font-semibold">Analytics could not be refreshed</p>
            <p className="mt-1 text-sm text-base-content/70">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => loadJobs(true)}
            className="text-sm font-semibold text-primary"
          >
            Retry
          </button>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Recorded jobs"
          value={loading ? "—" : metrics.total}
          detail="Jobs in the selected period"
          icon={Workflow}
        />
        <MetricCard
          label="Completed"
          value={loading ? "—" : metrics.completed}
          detail="Records marked completed"
          icon={CheckCircle2}
        />
        <MetricCard
          label="Failed"
          value={loading ? "—" : metrics.failed}
          detail="Records marked failed"
          icon={XCircle}
        />
        <MetricCard
          label="Terminal success rate"
          value={loading ? "—" : metrics.successRate}
          detail={metrics.successRateDetail}
          icon={TrendingUp}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <article className="min-w-0 rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Job activity</h2>
              <p className="mt-1 text-xs text-base-content/55">
                Recorded submissions per day, based on available job history.
              </p>
            </div>
            <span className="rounded-lg bg-base-200 px-3 py-1.5 text-xs text-base-content/65">
              {period === "all" ? "Latest 50 records" : PERIODS.find((item) => item.value === period)?.label}
            </span>
          </div>

          {loading ? (
            <div className="flex h-56 items-center justify-center text-sm text-base-content/50">
              Loading job activity…
            </div>
          ) : activity.every((item) => item.total === 0) ? (
            <div className="flex h-56 flex-col items-center justify-center text-center">
              <Activity size={25} className="text-base-content/35" />
              <p className="mt-3 text-sm font-semibold">No recorded activity in this period</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-base-content/55">
                There are no matching job creation timestamps in the records currently available.
              </p>
            </div>
          ) : (
            <div className="mt-8 flex h-48 items-end gap-1.5 sm:gap-2">
              {activity.map((item) => (
                <div
                  key={item.key}
                  className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                  title={`${item.label}: ${item.total} jobs, ${item.completed} completed, ${item.failed} failed`}
                >
                  <span className="text-[10px] tabular-nums text-base-content/60">
                    {item.total || ""}
                  </span>
                  <div className="flex w-full max-w-9 flex-1 items-end overflow-hidden rounded-t-md bg-base-200">
                    <div
                      className="w-full rounded-t-md bg-primary transition-all"
                      style={{
                        height: `${item.total ? Math.max(5, (item.total / maxActivity) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  {(period === "today" || period === "7d" || item.key.endsWith("-01") || item.key === activity[activity.length - 1]?.key) && (
                    <span className="whitespace-nowrap text-[9px] text-base-content/55">
                      {item.label}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold">Current workload</h2>
          <p className="mt-1 text-xs text-base-content/55">
            Status breakdown for the selected period.
          </p>

          <div className="mt-6 space-y-5">
            {[
              { label: "Active", value: metrics.active, icon: Clock3, color: "bg-primary" },
              { label: "Completed", value: metrics.completed, icon: CheckCircle2, color: "bg-success" },
              { label: "Failed", value: metrics.failed, icon: XCircle, color: "bg-error" },
            ].map((item) => {
              const percentage = metrics.total
                ? (item.value / metrics.total) * 100
                : 0;
              const Icon = item.icon;

              return (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm text-base-content/70">
                      <Icon size={15} />
                      {item.label}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {loading ? "—" : item.value}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-base-200"
                    role="progressbar"
                    aria-label={`${item.label} jobs`}
                    aria-valuemin={0}
                    aria-valuemax={metrics.total || 1}
                    aria-valuenow={item.value}
                  >
                    <div
                      className={`h-full rounded-full ${item.color}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-7 rounded-xl border border-base-300 bg-base-200/40 p-4">
            <p className="text-sm font-semibold">Data coverage</p>
            <p className="mt-1 text-xs leading-5 text-base-content/60">
              These metrics use up to 50 job records available to your signed-in account.
              They are not platform-wide request analytics.
            </p>
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Recent job records</h2>
            <p className="mt-1 text-xs text-base-content/55">
              Actual records matching the selected period.
            </p>
          </div>
          <span className="text-xs text-base-content/55">
            {loading ? "Loading…" : `${filteredJobs.length} records`}
          </span>
        </div>

        {!loading && filteredJobs.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Workflow size={25} className="mx-auto text-base-content/35" />
            <p className="mt-3 font-semibold">No jobs match this period</p>
            <p className="mt-1 text-sm text-base-content/55">
              Try a wider reporting period or submit a job from Jobs &amp; Workflows.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-base-200/60 text-xs uppercase tracking-wider text-base-content/55">
                <tr>
                  <th className="px-5 py-3 font-semibold">Job</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Attempt</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {filteredJobs
                  .slice()
                  .sort(
                    (a, b) =>
                      (validDate(b.createdAt)?.getTime() || 0) -
                      (validDate(a.createdAt)?.getTime() || 0),
                  )
                  .map((job) => (
                    <tr key={job.id} className="transition hover:bg-base-200/30">
                      <td className="max-w-[230px] px-5 py-4">
                        <p className="truncate font-medium">{job.type || "Background job"}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-base-content/45">
                          {job.id}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        {Number.isFinite(job.attempt) ? job.attempt : "—"}
                      </td>
                      <td className="px-5 py-4 text-xs text-base-content/65">
                        {formatDate(job.createdAt)}
                      </td>
                      <td className="px-5 py-4 text-xs text-base-content/65">
                        {formatDate(job.updatedAt)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300/70 pt-4 text-xs text-base-content/50">
        <span className="flex items-center gap-2">
          <Activity size={13} />
          Source: authenticated job-history API · maximum 50 records
        </span>
        <span>
          {lastUpdated
            ? `Last refreshed ${lastUpdated.toLocaleTimeString()}`
            : "Waiting for the first successful refresh"}
        </span>
      </footer>
    </main>
  );
}
