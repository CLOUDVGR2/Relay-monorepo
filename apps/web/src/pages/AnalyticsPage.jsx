/** Page component for AnalyticsPage in the Relay web application. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE_URL = (
  import.meta.env.VITE_NEST_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin)
).replace(/\/+$/, "");

const EXPRESS_API_BASE_URL = import.meta.env.MODE === "development"
  ? "http://localhost:5001/api"
  : "/api";

const PERIODS = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "Latest 50", value: "all" },
];

const ACTIVE_STATUSES = new Set(["queued", "processing"]);
const STATUS_COLORS = {
  queued: "#94a3b8",
  processing: "#38bdf8",
  completed: "#22c55e",
  failed: "#f43f5e",
};
const chartTooltipStyle = {
  borderRadius: 14,
  border: "1px solid var(--fallback-bc, oklch(var(--bc) / 0.14))",
  background: "var(--fallback-b1, oklch(var(--b1)))",
  color: "var(--fallback-bc, oklch(var(--bc)))",
  boxShadow: "0 18px 45px rgba(0,0,0,0.18)",
};

function normalizeJobs(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return null;
}

function recordDate(record) {
  const value = record?.createdAt ?? record?.created_at ??
    record?.startedAt ?? record?.updatedAt ?? record?.updated_at;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function filterRecordsByPeriod(records, period) {
  if (period === "all") return records;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "7d") start.setDate(start.getDate() - 6);
  if (period === "30d") start.setDate(start.getDate() - 29);
  return records.filter((record) => {
    const created = recordDate(record);
    return created && created >= start && created <= now;
  });
}

async function fetchScopedJson(path) {
  const response = await fetch(`${EXPRESS_API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`Request failed (HTTP ${response.status}).`);
  }
  return response.json();
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
    default:
      return "border-base-300 bg-base-200 text-base-content/70";
  }
}

function MetricCard({ label, value, detail, icon: Icon, accent = "neutral" }) {
  const accents = {
    primary: "text-primary",
    success: "text-success",
    danger: "text-error",
    info: "text-sky-600",
    neutral: "text-base-content/55",
  };
  const tone = accents[accent] || accents.neutral;

  return (
    <article className="relative rounded-xl border border-base-300/80 bg-base-100 px-5 py-5 shadow-[0_2px_8px_rgba(15,23,42,0.035)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-base-content/55">{label}</p>
        <Icon size={16} strokeWidth={1.7} className={tone} />
      </div>
      <p className="mt-5 text-[2rem] font-semibold leading-none tracking-[-0.045em] tabular-nums text-base-content sm:text-[2.25rem]">{value}</p>
      <p className="mt-3 text-xs leading-5 text-base-content/55">{detail}</p>
      <div className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-base-content/10 to-transparent" />
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
  const [workspaceTasks, setWorkspaceTasks] = useState([]);
  const [workspaceDocuments, setWorkspaceDocuments] = useState([]);
  const [workspaceRuns, setWorkspaceRuns] = useState([]);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceUpdated, setWorkspaceUpdated] = useState(null);

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

  const loadWorkspaceData = useCallback(async () => {
    setWorkspaceLoading(true);
    const results = await Promise.allSettled([
      fetchScopedJson("/ai/multi-agent/tasks?limit=50"),
      fetchScopedJson("/ai/documents"),
      fetchScopedJson("/ai/runs?limit=50"),
    ]);
    const errors = [];
    const [tasksResult, documentsResult, runsResult] = results;
    if (tasksResult.status === "fulfilled") {
      const payload = tasksResult.value;
      const records = Array.isArray(payload) ? payload :
        payload?.tasks ?? payload?.items ?? payload?.data ?? [];
      setWorkspaceTasks(Array.isArray(records) ? records : []);
    } else {
      errors.push(`AI tasks: ${tasksResult.reason?.message || "Unavailable"}`);
    }
    if (documentsResult.status === "fulfilled") {
      const payload = documentsResult.value;
      const records = Array.isArray(payload) ? payload :
        payload?.documents ?? payload?.items ?? payload?.data ?? [];
      setWorkspaceDocuments(Array.isArray(records) ? records : []);
    } else {
      errors.push(`Documents: ${documentsResult.reason?.message || "Unavailable"}`);
    }
    if (runsResult.status === "fulfilled") {
      const payload = runsResult.value;
      const records = Array.isArray(payload) ? payload :
        payload?.runs ?? payload?.items ?? payload?.data ?? [];
      setWorkspaceRuns(Array.isArray(records) ? records : []);
    } else {
      errors.push(`AI executions: ${runsResult.reason?.message || "Unavailable"}`);
    }
    setWorkspaceError(errors.join(" "));
    setWorkspaceUpdated(new Date());
    setWorkspaceLoading(false);
  }, []);

  useEffect(() => {
    void loadWorkspaceData();
    const interval = window.setInterval(() => void loadWorkspaceData(), 30000);
    return () => window.clearInterval(interval);
  }, [loadWorkspaceData]);

  const filteredWorkspaceTasks = useMemo(
    () => filterRecordsByPeriod(workspaceTasks, period),
    [workspaceTasks, period],
  );
  const filteredWorkspaceDocuments = useMemo(
    () => filterRecordsByPeriod(workspaceDocuments, period),
    [workspaceDocuments, period],
  );
  const filteredWorkspaceRuns = useMemo(
    () => filterRecordsByPeriod(workspaceRuns, period),
    [workspaceRuns, period],
  );
  const workspaceMetrics = useMemo(() => {
    const active = filteredWorkspaceTasks.filter((task) =>
      ["queued", "pending", "processing", "running", "in_progress"].includes(
        String(task.status || "").toLowerCase(),
      ),
    ).length;
    const failedTasks = filteredWorkspaceTasks.filter((task) =>
      String(task.status || "").toLowerCase() === "failed",
    ).length;
    const failedRuns = filteredWorkspaceRuns.filter((run) =>
      String(run.status || "").toLowerCase() === "failed",
    ).length;
    return {
      tasks: filteredWorkspaceTasks.length,
      active,
      documents: filteredWorkspaceDocuments.length,
      runs: filteredWorkspaceRuns.length,
      failures: failedTasks + failedRuns,
    };
  }, [filteredWorkspaceTasks, filteredWorkspaceDocuments, filteredWorkspaceRuns]);

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
    const queued = filteredJobs.filter(
      (job) => job.status.toLowerCase() === "queued",
    ).length;
    const processing = filteredJobs.filter(
      (job) => job.status.toLowerCase() === "processing",
    ).length;
    const active = filteredJobs.filter((job) =>
      ACTIVE_STATUSES.has(job.status.toLowerCase()),
    ).length;
    const terminal = completed + failed;

    return {
      total: filteredJobs.length,
      queued,
      processing,
      completed,
      failed,
      active,
      terminal,
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


  const businessAnalysis = useMemo(() => {
    const midpoint = Math.floor(activity.length / 2);
    const earlierPeriod = activity.slice(0, midpoint);
    const recentPeriod = activity.slice(midpoint);

    const earlierTotal = earlierPeriod.reduce(
      (sum, day) => sum + day.total,
      0,
    );
    const recentTotal = recentPeriod.reduce(
      (sum, day) => sum + day.total,
      0,
    );

    const earlierAverage = earlierPeriod.length
      ? earlierTotal / earlierPeriod.length
      : 0;
    const recentAverage = recentPeriod.length
      ? recentTotal / recentPeriod.length
      : 0;

    const volumeMovement =
      earlierAverage > 0
        ? ((recentAverage - earlierAverage) / earlierAverage) * 100
        : null;

    let growthLabel = "Not available for a one-day reporting period";

    if (activity.length > 1) {
      if (earlierTotal === 0 && recentTotal === 0) {
        growthLabel = "No activity in either comparison period";
      } else if (earlierTotal === 0) {
        growthLabel = "Activity resumed from a zero baseline";
      } else {
        growthLabel = `${volumeMovement > 0 ? "+" : ""}${Math.round(volumeMovement)}% vs. the earlier period`;
      }
    }

    const failureRate = metrics.terminal
      ? (metrics.failed / metrics.terminal) * 100
      : null;

    const activeShare = metrics.total
      ? (metrics.active / metrics.total) * 100
      : 0;

    const strengths =
      metrics.completed > 0
        ? `${metrics.completed} completed records demonstrate successful job delivery. Terminal success rate: ${metrics.successRate}.`
        : "No completed outcomes are present in this selection. Delivery performance needs more recorded outcomes.";

    const weaknesses =
      metrics.failed > 0
        ? `${metrics.failed} failed records require investigation. Failure rate among terminal outcomes: ${Math.round(failureRate)}%.`
        : metrics.terminal > 0
          ? "No failed terminal outcomes appear in this sample. Continue monitoring as the record set grows."
          : "There are no terminal outcomes yet, limiting the assessment of delivery quality.";

    const opportunities =
      metrics.active > 0
        ? `${metrics.active} jobs remain queued or processing. Review throughput and job age to identify opportunities to improve completion time.`
        : "Use the daily volume trend and future job history to identify changes in demand and processing efficiency.";

    const threats =
      metrics.failed > 0
        ? "Recorded failures indicate operational reliability exposure. The available history does not identify root causes."
        : metrics.active > 0
          ? "Open workload may become a delivery risk if jobs remain unprocessed. Job age and worker capacity are not available in this dataset."
          : "No immediate failure or backlog signal is visible. External, financial, and capacity risks are not represented by job history.";

    const summary =
      metrics.failed > 0
        ? `${metrics.failed} failed job${metrics.failed === 1 ? "" : "s"} warrant management attention. Review the underlying records and investigate recurring causes.`
        : metrics.active > 0
          ? `${metrics.active} job${metrics.active === 1 ? "" : "s"} remain in the active workload. Monitor queue progression and processing throughput.`
          : metrics.completed > 0
            ? `The selected records show ${metrics.completed} completed jobs and no recorded failures. Continue monitoring delivery consistency.`
            : "The selected records do not yet provide enough completed or failed outcomes for a meaningful delivery assessment.";

    return {
      earlierAverage,
      recentAverage,
      volumeMovement,
      growthLabel,
      failureRate,
      activeShare,
      strengths,
      weaknesses,
      opportunities,
      threats,
      summary,
    };
  }, [activity, metrics]);

  return (
    <main className="mx-auto max-w-[1440px] space-y-7 px-4 py-7 text-base-content sm:px-6 lg:px-9 lg:py-10">
      <header className="flex flex-col justify-between gap-6 border-b border-base-300/80 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-base-content/50">
            Operations intelligence <span className="px-1.5 text-base-content/25">/</span> Performance
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.045em] text-base-content sm:text-[2.65rem]">
            Analytics &amp; performance
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-base-content/60">
            An executive view of background-job volume, outcomes, and current workload.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-medium uppercase tracking-[0.12em] text-base-content/45">
            <span className="inline-flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-success" />
              Account-scoped reporting
            </span>
            <span>Source: authenticated job history</span>
            <span>Maximum 50 records</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            onClick={() => { void loadJobs(true); void loadWorkspaceData(); }}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3.5 py-2 text-xs font-semibold text-base-content/75 transition hover:border-base-content/25 hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Refresh report
          </button>
          <p className="text-[10px] tabular-nums text-base-content/45">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleString()}`
              : "Awaiting first data refresh"}
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-3 border-b border-base-300/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Reporting period</h2>
          <p className="mt-1 text-xs text-base-content/50">
            Select the job creation window for this report.
          </p>
        </div>
        <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-base-300/80 bg-base-200/60 p-1" role="group" aria-label="Analytics reporting period">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={period === item.value}
              onClick={() => setPeriod(item.value)}
              className={`rounded-md px-3.5 py-2 text-xs font-semibold transition ${
                period === item.value
                  ? "bg-base-100 text-base-content shadow-sm ring-1 ring-base-300/80"
                  : "text-base-content/55 hover:text-base-content"
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
            onClick={() => { void loadJobs(true); void loadWorkspaceData(); }}
            className="text-sm font-semibold text-primary"
          >
            Retry
          </button>
        </section>
      )}

      <section className="rounded-2xl border border-base-300/70 bg-base-100/70 p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">AI & knowledge intelligence</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Workspace activity</h2>
            <p className="mt-1 text-xs text-base-content/50">Authenticated workspace data · selected reporting period</p>
          </div>
          <p className="text-[10px] text-base-content/45">
            {workspaceUpdated ? `Updated ${workspaceUpdated.toLocaleTimeString()}` : "Loading workspace data"}
          </p>
        </div>
        {workspaceError && (
          <div role="status" className="mb-4 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-base-content/70">
            Some workspace data could not be loaded: {workspaceError}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "AI tasks", value: workspaceMetrics.tasks, detail: `${workspaceMetrics.active} active · ${workspaceMetrics.failures} failures`, icon: Workflow },
            { label: "Active tasks", value: workspaceMetrics.active, detail: "Queued or currently running", icon: Activity },
            { label: "Knowledge documents", value: workspaceMetrics.documents, detail: "Documents in the returned sample", icon: ShieldCheck },
            { label: "AI executions", value: workspaceMetrics.runs, detail: "Recorded AI runs in this period", icon: Zap },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.label} className="rounded-xl border border-base-300/70 bg-base-200/35 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-base-content/60">{item.label}</p>
                  <Icon size={16} className="text-primary/75" />
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                  {workspaceLoading && !workspaceUpdated ? "—" : item.value}
                </p>
                <p className="mt-2 text-[11px] text-base-content/50">{item.detail}</p>
              </article>
            );
          })}
        </div>
        <div className="mt-4 rounded-xl border border-base-300/60 bg-base-200/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Recent AI task activity</h3>
            <span className="text-[10px] text-base-content/45">Latest 6 · available sample</span>
          </div>
          {filteredWorkspaceTasks.length === 0 ? (
            <p className="py-3 text-xs text-base-content/50">
              {workspaceLoading ? "Loading AI task activity…" : "No AI tasks found in this reporting period."}
            </p>
          ) : (
            <div className="divide-y divide-base-300/60">
              {filteredWorkspaceTasks.slice(0, 6).map((task, index) => (
                <div key={task.id || task._id || index} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{task.name || task.type || task.title || `AI task ${index + 1}`}</p>
                    <p className="mt-1 text-[10px] text-base-content/45">
                      {recordDate(task)?.toLocaleString() || "Date unavailable"}
                    </p>
                  </div>
                  <span className="rounded-full border border-base-300 px-2.5 py-1 text-[10px] font-semibold capitalize text-base-content/65">
                    {String(task.status || "unknown").replaceAll("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="mt-3 text-[10px] leading-5 text-base-content/40">
          Workspace figures reflect authenticated API results and the available record sample. They are not company-wide totals.
        </p>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Executive snapshot</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Operational performance</h2>
          </div>
          <p className="text-xs text-base-content/50">Selected reporting period · account-scoped records</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Recorded jobs" value={loading ? "—" : metrics.total} detail="Jobs represented in this reporting period" icon={Workflow} accent="primary" />
          <MetricCard label="Queued" value={loading ? "—" : metrics.queued} detail="Waiting to be picked up by a worker" icon={Clock3} accent="neutral" />
          <MetricCard label="Processing" value={loading ? "—" : metrics.processing} detail="Currently marked as processing" icon={Zap} accent="info" />
          <MetricCard label="Completed" value={loading ? "—" : metrics.completed} detail="Records marked completed" icon={CheckCircle2} accent="success" />
          <MetricCard label="Failed" value={loading ? "—" : metrics.failed} detail="Records marked failed" icon={XCircle} accent="danger" />
          <MetricCard label="Terminal success rate" value={loading ? "—" : metrics.successRate} detail={metrics.successRateDetail} icon={TrendingUp} accent="success" />
        </div>
      </section>

      {!loading && filteredJobs.length > 0 && (
        <section>
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Executive readout</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">What the numbers say</h2>
            <p className="mt-1 text-xs text-base-content/50">
              Derived from the current selection; these observations describe this account’s records only.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-xl border border-base-300/80 bg-base-100 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-success">
                <TrendingUp size={17} />
                <span className="text-xs font-bold uppercase tracking-[0.12em]">Terminal outcomes</span>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{metrics.terminal ? metrics.successRate : "—"}</p>
              <p className="mt-2 text-sm font-medium">Completion share</p>
              <p className="mt-1 text-xs leading-5 text-base-content/55">
                {metrics.terminal
                  ? `${metrics.completed} completed out of ${metrics.terminal} completed or failed records.`
                  : "No completed or failed records are available in this selection."}
              </p>
            </article>
            <article className="rounded-xl border border-base-300/80 bg-base-100 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-sky-500">
                <Activity size={17} />
                <span className="text-xs font-bold uppercase tracking-[0.12em]">Open workload</span>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{metrics.active}</p>
              <p className="mt-2 text-sm font-medium">Queued + processing</p>
              <p className="mt-1 text-xs leading-5 text-base-content/55">
                {metrics.active
                  ? `${metrics.queued} queued and ${metrics.processing} processing in the selected records.`
                  : "No queued or processing records appear in this selection."}
              </p>
            </article>
            <article className="rounded-xl border border-base-300/80 bg-base-100 p-4 sm:p-5">
              <div className="flex items-center gap-2 text-error">
                <AlertCircle size={17} />
                <span className="text-xs font-bold uppercase tracking-[0.12em]">Failure signal</span>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{metrics.failed}</p>
              <p className="mt-2 text-sm font-medium">Failed records</p>
              <p className="mt-1 text-xs leading-5 text-base-content/55">
                {metrics.failed
                  ? "Review the failed job records below for their latest reported details."
                  : "No failed records appear in this selection."}
              </p>
            </article>
          </div>
        </section>
      )}

      {!loading && filteredJobs.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-base-300/70 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                Business intelligence
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                Executive business brief
              </h2>
              <p className="mt-1 text-xs text-base-content/50">
                Management interpretation of recorded operational activity
              </p>
            </div>
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-base-content/45">
              Evidence-based · Account scoped
            </span>
          </div>

          <article className="rounded-xl border border-base-300/80 bg-base-100 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-lg border border-base-300 p-2 text-base-content/65">
                <Target size={17} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Management commentary</h3>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-base-content/65">
                  {businessAnalysis.summary}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 border-t border-base-300/70 pt-5 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-base-content/45">
                  Job-volume movement
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {businessAnalysis.volumeMovement === null
                    ? "—"
                    : `${businessAnalysis.volumeMovement > 0 ? "+" : ""}${Math.round(businessAnalysis.volumeMovement)}%`}
                </p>
                <p className="mt-1 text-xs leading-5 text-base-content/50">
                  {businessAnalysis.growthLabel}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-base-content/45">
                  Average daily volume
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {businessAnalysis.recentAverage.toFixed(1)}
                </p>
                <p className="mt-1 text-xs leading-5 text-base-content/50">
                  Recent half of the selected chart window
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-base-content/45">
                  Open workload share
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums">
                  {Math.round(businessAnalysis.activeShare)}%
                </p>
                <p className="mt-1 text-xs leading-5 text-base-content/50">
                  {metrics.active} queued or processing out of {metrics.total} records
                </p>
              </div>
            </div>
          </article>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck size={16} className="text-base-content/55" />
              <h3 className="text-sm font-semibold">Operational SWOT analysis</h3>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  title: "Strengths",
                  subtitle: "Internal advantages",
                  icon: ShieldCheck,
                  content: businessAnalysis.strengths,
                },
                {
                  title: "Weaknesses",
                  subtitle: "Internal limitations",
                  icon: AlertCircle,
                  content: businessAnalysis.weaknesses,
                },
                {
                  title: "Opportunities",
                  subtitle: "Areas to improve",
                  icon: Lightbulb,
                  content: businessAnalysis.opportunities,
                },
                {
                  title: "Threats",
                  subtitle: "Operational exposure",
                  icon: AlertTriangle,
                  content: businessAnalysis.threats,
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <article
                    key={item.title}
                    className="rounded-xl border border-base-300/80 bg-base-100 p-4 sm:p-5"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={16} className="text-base-content/55" />
                      <h4 className="text-sm font-semibold">{item.title}</h4>
                      <span className="ml-auto text-[10px] uppercase tracking-[0.1em] text-base-content/40">
                        {item.subtitle}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-base-content/65">
                      {item.content}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] leading-5 text-base-content/45">
            Methodology: volume movement compares average daily job creation in the first and second halves of the selected chart window. All measures use at most 50 recent account-scoped records. This is an operational SWOT, not an assessment of the company’s overall market position. Revenue, profit, customer growth, market share, job age, and external risks are not available from this API.
          </p>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <article className="min-w-0 rounded-xl border border-base-300/80 bg-base-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Job activity</h2>
              <p className="mt-1 text-xs text-base-content/55">
                {period === "all"
                  ? "Daily creation activity across the latest 30 days; KPIs and records cover up to 50 recent jobs."
                  : "Jobs created each day, grouped by their current recorded status—not by completion date."}
              </p>
            </div>
            <span className="rounded-lg bg-base-200 px-3 py-1.5 text-xs text-base-content/65">
              {period === "all" ? "30-day activity · latest 50 jobs" : PERIODS.find((item) => item.value === period)?.label}
            </span>
          </div>

          {loading ? (
            <div className="flex h-[290px] items-center justify-center text-sm text-base-content/50">
              Loading executive activity…
            </div>
          ) : activity.every((item) => item.total === 0) ? (
            <div className="flex h-[290px] flex-col items-center justify-center text-center">
              <Activity size={28} className="text-base-content/35" />
              <p className="mt-3 text-sm font-semibold">No recorded activity in this period</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-base-content/55">
                No matching job creation timestamps are available in the current record set.
              </p>
            </div>
          ) : (
            <div className="mt-5 h-[290px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activity} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsTotalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#64748b" stopOpacity={0.20} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="analyticsCompletedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.14} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="analyticsFailedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#b45353" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }} minTickGap={22} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }} />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Area type="monotone" dataKey="total" name="Submitted" stroke="#64748b" strokeWidth={2.2} fill="url(#analyticsTotalFill)" activeDot={{ r: 5, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke="#0f766e" strokeWidth={1.8} fill="url(#analyticsCompletedFill)" />
                  <Area type="monotone" dataKey="failed" name="Failed" stroke="#b45353" strokeWidth={1.8} fill="url(#analyticsFailedFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="rounded-xl border border-base-300/80 bg-base-100 p-4 sm:p-5">
          <h2 className="text-lg font-semibold">Current workload</h2>
          <p className="mt-1 text-xs text-base-content/55">
            Status breakdown for the selected period.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(150px,0.9fr)_minmax(0,1.1fr)] xl:grid-cols-1 2xl:grid-cols-[minmax(150px,0.9fr)_minmax(0,1.1fr)]">
            <div className="relative mx-auto h-44 w-full max-w-[220px]">
              {loading ? (
                <div className="grid h-full place-items-center text-xs text-base-content/45">Loading composition…</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Queued", value: metrics.queued, color: STATUS_COLORS.queued },
                          { name: "Processing", value: metrics.processing, color: STATUS_COLORS.processing },
                          { name: "Completed", value: metrics.completed, color: STATUS_COLORS.completed },
                          { name: "Failed", value: metrics.failed, color: STATUS_COLORS.failed },
                        ].filter((item) => item.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="68%"
                        outerRadius="92%"
                        paddingAngle={3}
                        stroke="none"
                      >
                        {[
                          { name: "Queued", value: metrics.queued, color: STATUS_COLORS.queued },
                          { name: "Processing", value: metrics.processing, color: STATUS_COLORS.processing },
                          { name: "Completed", value: metrics.completed, color: STATUS_COLORS.completed },
                          { name: "Failed", value: metrics.failed, color: STATUS_COLORS.failed },
                        ].filter((item) => item.value > 0).map((item) => (
                          <Cell key={item.name} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">{metrics.total}</span>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-base-content/50">Total jobs</span>
                  </div>
                </>
              )}
            </div>
            <div className="min-w-0 space-y-4">
            {[
              { label: "Queued", value: metrics.queued, icon: Clock3, color: "bg-slate-500" },
              { label: "Processing", value: metrics.processing, icon: Zap, color: "bg-teal-700" },
              { label: "Completed", value: metrics.completed, icon: CheckCircle2, color: "bg-emerald-700" },
              { label: "Failed", value: metrics.failed, icon: XCircle, color: "bg-rose-700" },
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
          </div>

          <div className="mt-6 border-t border-base-300/80 pt-4">
            <p className="text-sm font-semibold">Data coverage</p>
            <p className="mt-1 text-xs leading-5 text-base-content/60">
              Metrics use up to 50 recent job records available to your signed-in account.
              The activity chart shows the selected calendar window (30 days for Latest 50).
              These are not platform-wide request analytics.
            </p>
          </div>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-base-300/80 bg-base-100">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300/80 px-4 py-4 sm:px-5">
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
          <div className="px-5 py-12 text-center">
            <Workflow size={25} className="mx-auto text-base-content/35" />
            <p className="mt-3 font-semibold">No jobs match this period</p>
            <p className="mt-1 text-sm text-base-content/55">
              Try a wider reporting period or submit a job from Jobs &amp; Workflows.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-base-200/35 text-[10px] uppercase tracking-[0.14em] text-base-content/55">
                <tr>
                  <th className="px-5 py-3 font-semibold">Job</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Processing attempts</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base-300">
                {filteredJobs.map((job) => (
                    <tr key={job.id} className="transition-colors hover:bg-base-200/25">
                      <td className="max-w-[230px] px-4 py-3.5 sm:px-5">
                        <p className="truncate font-medium">{job.type || "Background job"}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-base-content/45">
                          {job.id}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 sm:px-5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClasses(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 tabular-nums">
                        {Number.isFinite(job.attempt)
                          ? job.attempt === 0
                            ? "Not started"
                            : job.attempt
                          : "—"}
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
