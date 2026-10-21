/** Page component for IntelligencePage in the Relay web application. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const NEST_API_URL = (
  import.meta.env.VITE_NEST_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin)
).replace(/\/+$/, "");

const EXPRESS_API_URL = (
  import.meta.env.MODE === "development"
    ? "http://localhost:5001/api"
    : "/api"
).replace(/\/+$/, "");

const PERIODS = ["Today", "7 days", "30 days"];

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--fallback-bc, oklch(var(--bc) / 0.12))",
  background: "var(--fallback-b1, oklch(var(--b1)))",
  color: "var(--fallback-bc, oklch(var(--bc)))",
  boxShadow: "0 12px 36px rgba(0,0,0,0.12)",
};

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Your session may have expired. Sign in again.");
    }
    throw new Error(`Service returned HTTP ${response.status}`);
  }

  return response.json();
}

function periodStart(period) {
  const start = new Date();

  if (period === "Today") {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (period === "7 days" ? 6 : 29));
  }

  return start;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown date";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function MetricCard({ title, value, description, icon: Icon }) {
  return (
    <article className="rounded-2xl border border-base-300/70 bg-base-100 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-base-content/65">{title}</p>
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon size={17} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-base-content/55">
        {description}
      </p>
    </article>
  );
}

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-base-content/55">
          {eyebrow}
        </p>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function DataNotice({ children, error = false }) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-xs leading-5 ${
        error
          ? "border-error/25 bg-error/5 text-base-content/75"
          : "border-base-300 bg-base-200/60 text-base-content/65"
      }`}
    >
      {error ? (
        <AlertCircle size={15} className="mt-0.5 shrink-0 text-error" />
      ) : (
        <Activity size={15} className="mt-0.5 shrink-0 text-primary" />
      )}
      <div>{children}</div>
    </div>
  );
}

export default function IntelligencePage() {
  const [period, setPeriod] = useState("Today");
  const [jobs, setJobs] = useState([]);
  const [aiTelemetry, setAiTelemetry] = useState(null);
  const [aiRuns, setAiRuns] = useState([]);
  const [jobsError, setJobsError] = useState("");
  const [telemetryError, setTelemetryError] = useState("");
  const [runsError, setRunsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

    const results = await Promise.allSettled([
      fetchJson(`${NEST_API_URL}/jobs?limit=100`),
      fetchJson(`${EXPRESS_API_URL}/ai/metrics`),
      fetchJson(`${EXPRESS_API_URL}/ai/runs?limit=100`),
    ]);

    const jobsResult = results[0];
    const telemetryResult = results[1];
    const runsResult = results[2];

    if (jobsResult.status === "fulfilled") {
      const payload = jobsResult.value;
      const records = Array.isArray(payload?.jobs) ? payload.jobs : null;

      if (records) {
        setJobs(records);
        setJobsError("");
      } else {
        setJobsError("The jobs service returned an unexpected response.");
      }
    } else {
      setJobsError(jobsResult.reason?.message || "Could not load job history.");
    }

    if (telemetryResult.status === "fulfilled") {
      const payload = telemetryResult.value;

      if (
        payload?.scope === "process_local" &&
        Array.isArray(payload.metrics)
      ) {
        setAiTelemetry(payload);
        setTelemetryError("");
      } else {
        setTelemetryError("The AI service returned an unexpected metrics response.");
      }
    } else {
      setTelemetryError(
        telemetryResult.reason?.message || "Could not load AI telemetry.",
      );
    }

    if (runsResult.status === "fulfilled") {
      const payload = runsResult.value;

      if (Array.isArray(payload?.runs)) {
        setAiRuns(payload.runs);
        setRunsError("");
      } else {
        setRunsError("The AI execution service returned an unexpected response.");
      }
    } else {
      setRunsError(
        runsResult.reason?.message || "Could not load AI execution history.",
      );
    }

    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();

    const intervalId = window.setInterval(() => {
      loadData(true);
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [loadData]);

  const filteredJobs = useMemo(() => {
    const start = periodStart(period).getTime();

    return jobs.filter((job) => {
      const created = new Date(job.createdAt).getTime();
      return Number.isFinite(created) && created >= start;
    });
  }, [jobs, period]);

  const filteredRuns = useMemo(() => {
    const start = periodStart(period).getTime();

    return aiRuns.filter((run) => {
      const created = new Date(run.startedAt || run.createdAt).getTime();
      return Number.isFinite(created) && created >= start;
    });
  }, [aiRuns, period]);

  const counts = useMemo(() => {
    const statusCount = (status) =>
      filteredJobs.filter(
        (job) => String(job.status).toLowerCase() === status,
      ).length;

    return {
      active: filteredJobs.filter((job) =>
        ["queued", "processing", "retrying"].includes(
          String(job.status).toLowerCase(),
        ),
      ).length,
      completed: statusCount("completed"),
      failed: statusCount("failed"),
    };
  }, [filteredJobs]);

  const jobActivity = useMemo(() => {
    const buckets = new Map();
    const start = periodStart(period);
    const today = new Date();
    const days = period === "Today" ? 1 : period === "7 days" ? 7 : 30;

    for (let offset = 0; offset < days; offset += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + offset);

      const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
      const label =
        period === "Today"
          ? "Today"
          : new Intl.DateTimeFormat(undefined, {
              month: "short",
              day: "numeric",
            }).format(day);

      buckets.set(key, { date: key, time: label, jobs: 0 });
    }

    for (const job of filteredJobs) {
      const created = new Date(job.createdAt);
      if (Number.isNaN(created.getTime())) continue;

      const key = `${created.getFullYear()}-${created.getMonth()}-${created.getDate()}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.jobs += 1;
    }

    // The chart is derived from real job timestamps. Empty buckets are zero,
    // not fabricated activity.
    void today;
    return [...buckets.values()];
  }, [filteredJobs, period]);

  const routeTelemetry = useMemo(() => {
    if (!aiTelemetry) return [];

    return [...aiTelemetry.metrics]
      .filter((item) => Number.isFinite(item.request_count))
      .sort((a, b) => b.request_count - a.request_count)
      .slice(0, 8)
      .map((item) => ({
        route: `${item.method} ${item.route}`,
        requests: item.request_count,
        failures: item.failure_count,
      }));
  }, [aiTelemetry]);

  const aiTotals = useMemo(() => {
    const rows = aiTelemetry?.metrics || [];

    return rows.reduce(
      (total, row) => ({
        requests: total.requests + (Number(row.request_count) || 0),
        failures: total.failures + (Number(row.failure_count) || 0),
        highestP95: Math.max(
          total.highestP95,
          Number(row.p95_latency_ms) || 0,
        ),
      }),
      { requests: 0, failures: 0, highestP95: 0 },
    );
  }, [aiTelemetry]);

  return (
    <main className="min-h-full bg-base-200/70 px-4 pb-12 pt-24 text-base-content sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs text-base-content/55">
              <span>Relay</span>
              <span>/</span>
              <span className="text-base-content">Intelligence</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Intelligence
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success">
                <Activity size={12} />
                Live data sources
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-base-content/65">
              Persistent AI execution history, operational job records, and
              Python request telemetry from authenticated backend services.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex rounded-xl border border-base-300 bg-base-100 p-1"
              aria-label="Job history time range"
            >
              {PERIODS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPeriod(item)}
                  aria-pressed={period === item}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    period === item
                      ? "bg-primary text-white shadow-sm"
                      : "text-base-content/65 hover:text-base-content"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-sm font-medium transition hover:border-primary/40 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={refreshing ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-base-content/55">
          <span className="inline-flex items-center gap-2">
            <Clock3 size={14} />
            Job records: {period.toLowerCase()}
          </span>
          <span>
            {lastUpdated
              ? `Last checked ${lastUpdated.toLocaleTimeString()}`
              : "Waiting for first data check"}
            {" · "}Automatic refresh every 30 seconds
          </span>
        </div>

        {jobsError && (
          <div className="mb-4">
            <DataNotice error>
              <strong>Job history unavailable.</strong> {jobsError}
            </DataNotice>
          </div>
        )}

        {telemetryError && (
          <div className="mb-4">
            <DataNotice error>
              <strong>Python telemetry unavailable.</strong> {telemetryError}
              {" "}Job history remains independently available.
            </DataNotice>
          </div>
        )}

        {runsError && (
          <div className="mb-4">
            <DataNotice error>
              <strong>AI execution history unavailable.</strong> {runsError}
              {" "}Job history and Python telemetry remain independently available.
            </DataNotice>
          </div>
        )}

        <section
          aria-label="Operational metrics"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <MetricCard
            title="Jobs in period"
            value={loading && jobs.length === 0 ? "—" : formatNumber(filteredJobs.length)}
            description="Authenticated job records matching the selected date range"
            icon={Workflow}
          />
          <MetricCard
            title="Active jobs"
            value={loading && jobs.length === 0 ? "—" : formatNumber(counts.active)}
            description="Queued, processing, or retrying"
            icon={Clock3}
          />
          <MetricCard
            title="Completed jobs"
            value={loading && jobs.length === 0 ? "—" : formatNumber(counts.completed)}
            description={`${formatNumber(counts.failed)} failed in the selected period`}
            icon={CheckCircle2}
          />
          <MetricCard
            title="AI executions"
            value={loading && aiRuns.length === 0 && !runsError
              ? "—"
              : formatNumber(filteredRuns.length)}
            description="Persistent AI answer runs in the selected period"
            icon={Bot}
          />
        </section>

        <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.9fr)]">
          <article className="min-w-0 rounded-2xl border border-base-300/70 bg-base-100 p-4 shadow-sm sm:p-6">
            <SectionHeading
              eyebrow="Background processing"
              title="Recorded jobs over time"
              action={
                <span className="text-xs text-base-content/50">
                  {filteredJobs.length} records
                </span>
              }
            />
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={jobActivity}
                  margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="realJobFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7c6cf2" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#7c6cf2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }}
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="jobs"
                    name="Recorded jobs"
                    stroke="#7c6cf2"
                    strokeWidth={2.5}
                    fill="url(#realJobFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs leading-5 text-base-content/50">
              Based on job creation timestamps returned by NestJS. The API
              returns at most 100 recent records; older records may be omitted.
            </p>
          </article>

          <article className="min-w-0 rounded-2xl border border-base-300/70 bg-base-100 p-4 shadow-sm sm:p-6">
            <SectionHeading
              eyebrow="AI service"
              title="Requests by route"
              action={
                <span className="text-xs text-base-content/50">
                  Process-local
                </span>
              }
            />
            {aiTelemetry && routeTelemetry.length > 0 ? (
              <>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={routeTelemetry}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid stroke="currentColor" strokeOpacity={0.08} horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: "currentColor", opacity: 0.55 }}
                      />
                      <YAxis
                        dataKey="route"
                        type="category"
                        width={125}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: "currentColor", opacity: 0.65 }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar
                        dataKey="requests"
                        name="Requests"
                        fill="#38bdf8"
                        radius={[0, 5, 5, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-base-200/60 p-3">
                    <p className="text-xs text-base-content/55">Recorded failures</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {formatNumber(aiTotals.failures)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-base-200/60 p-3">
                    <p className="text-xs text-base-content/55">Highest route p95</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {aiTelemetry.metrics.some((row) => row.p95_latency_ms != null)
                        ? `${aiTotals.highestP95.toLocaleString()} ms`
                        : "—"}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[280px] items-center justify-center">
                <p className="max-w-xs text-center text-sm leading-6 text-base-content/55">
                  {telemetryError
                    ? "Route telemetry could not be loaded."
                    : "No Python route requests have been recorded in this process yet."}
                </p>
              </div>
            )}
            <p className="mt-3 text-xs leading-5 text-base-content/50">
              Counters reset when the Python process restarts. Latency is
              reported per route; the figure above is the highest observed
              route p95, not a global percentile.
            </p>
          </article>
        </section>

        <section className="mt-5 rounded-2xl border border-base-300/70 bg-base-100 p-5 shadow-sm sm:p-6">
          <SectionHeading
            eyebrow="Recent activity"
            title="Latest job records"
            action={
              <span className="text-xs text-base-content/50">
                Latest {Math.min(filteredJobs.length, 8)} shown
              </span>
            }
          />
          {filteredJobs.length > 0 ? (
            <div className="divide-y divide-base-300/60">
              {[...filteredJobs]
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
                )
                .slice(0, 8)
                .map((job) => {
                  const status = String(job.status || "unknown").toLowerCase();
                  const StatusIcon =
                    status === "completed"
                      ? CheckCircle2
                      : status === "failed"
                        ? XCircle
                        : status === "processing"
                          ? Zap
                          : Clock3;

                  return (
                    <div
                      key={job.id}
                      className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-base-200 text-base-content/65">
                        <StatusIcon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {job.type || "Background job"}
                        </p>
                        <p className="mt-1 break-all text-xs text-base-content/50">
                          {job.id}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex rounded-full border border-base-300 px-2.5 py-1 text-xs capitalize">
                          {status}
                        </span>
                        <p className="mt-1 text-xs text-base-content/50">
                          {formatDate(job.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="rounded-xl bg-base-200/50 px-4 py-8 text-center">
              <p className="text-sm font-medium">
                {loading ? "Loading job history…" : "No job records in this period"}
              </p>
              <p className="mt-1 text-xs text-base-content/55">
                {jobsError
                  ? "Resolve the job-history connection to see operational records."
                  : "Only actual records returned by the authenticated jobs API appear here."}
              </p>
            </div>
          )}
        </section>

        <section className="mt-5 rounded-2xl border border-base-300/70 bg-base-100 p-5 shadow-sm sm:p-6">
          <SectionHeading
            eyebrow="Persistent AI history"
            title="Recent AI executions"
            action={
              <span className="text-xs text-base-content/50">
                Latest {Math.min(filteredRuns.length, 8)} shown
              </span>
            }
          />

          {filteredRuns.length > 0 ? (
            <div className="divide-y divide-base-300/60">
              {[...filteredRuns]
                .sort(
                  (a, b) =>
                    new Date(b.startedAt || b.createdAt).getTime() -
                    new Date(a.startedAt || a.createdAt).getTime(),
                )
                .slice(0, 8)
                .map((run) => {
                  const status = String(run.status || "unknown").toLowerCase();
                  const StatusIcon =
                    status === "succeeded"
                      ? CheckCircle2
                      : status === "failed"
                        ? XCircle
                        : status === "running"
                          ? Zap
                          : Clock3;

                  return (
                    <div
                      key={run._id}
                      className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-base-200 text-base-content/65">
                        <StatusIcon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">AI answer</p>
                        <p className="mt-1 text-xs text-base-content/50">
                          {formatDate(run.startedAt || run.createdAt)}
                        </p>
                        {run.errorCategory && (
                          <p className="mt-1 text-xs text-error">
                            {String(run.errorCategory).replaceAll("_", " ")}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="inline-flex rounded-full border border-base-300 px-2.5 py-1 text-xs capitalize">
                          {status}
                        </span>
                        <p className="mt-1 text-xs text-base-content/50">
                          {Number.isFinite(run.durationMs)
                            ? `${formatNumber(run.durationMs)} ms`
                            : status === "running"
                              ? "In progress"
                              : "Duration unavailable"}
                        </p>
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="rounded-xl bg-base-200/50 px-4 py-8 text-center">
              <p className="text-sm font-medium">
                {loading
                  ? "Loading AI execution history…"
                  : runsError
                    ? "AI execution history could not be loaded"
                    : "No AI executions in this period"}
              </p>
              <p className="mt-1 text-xs text-base-content/55">
                {runsError
                  ? "Check the authenticated AI history endpoint and refresh."
                  : "Successful and failed AI answer attempts are recorded from when execution tracking is enabled."}
              </p>
            </div>
          )}
        </section>

        <footer className="mt-8 flex flex-col gap-2 border-t border-base-300/70 pt-4 text-xs text-base-content/50 sm:flex-row sm:items-center sm:justify-between">
          <span>Relay Intelligence · Operational data</span>
          <span>
            {jobsError ? "Job history disconnected" : "Job history endpoint connected"}
            {" · "}
            {telemetryError ? "AI telemetry unavailable" : "AI telemetry endpoint connected"}
            {" · "}
            {runsError ? "AI execution history unavailable" : "AI execution history connected"}
          </span>
        </footer>
      </div>
    </main>
  );
}
