/** UI component for OperationsOverview in the Relay web application. */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card } from "../components/ui";
import IncidentResponsePanel from "./IncidentResponsePanel";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Network,
  Radio,
  RefreshCw,
  Workflow,
  Zap,
} from "lucide-react";

const HEALTH_CHECKS = [
  {
    id: "express",
    url: import.meta.env.VITE_EXPRESS_HEALTH_URL || "/api/health/ready",
  },
  {
    id: "nestjs",
    url: import.meta.env.VITE_NEST_HEALTH_URL || (import.meta.env.DEV ? "http://localhost:3000/health/ready" : "/health/ready"),
  },
  {
    id: "go",
    url: import.meta.env.VITE_GO_HEALTH_URL || "/go/readyz",
  },
  {
    id: "python",
    url: import.meta.env.VITE_PYTHON_AI_HEALTH_URL || "/python/readyz",
  },
];

const INITIAL_HEALTH = Object.fromEntries(
  [
    ...HEALTH_CHECKS.map(({ id }) => id),
    "worker",
    "dataLayer",
  ].map((id) => [
    id,
    { status: "checking", detail: "Waiting for health check." },
  ]),
);

const buildMetrics = (queuedJobs) => [
  { label: "API requests", value: "—", detail: "Waiting for telemetry", icon: Activity, accent: "text-sky-400", glow: "bg-sky-400/10" },
  { label: "Active AI runs", value: "—", detail: "Waiting for agent data", icon: Bot, accent: "text-cyan-400", glow: "bg-cyan-400/10" },
  { label: "Average latency", value: "—", detail: "No measurements connected", icon: Zap, accent: "text-blue-400", glow: "bg-blue-400/10" },
  {
    label: "Queued jobs",
    value: queuedJobs.value,
    detail: queuedJobs.detail,
    icon: Workflow,
    accent: "text-indigo-400",
    glow: "bg-indigo-400/10",
  },
];

const services = [
  { name: "Express API", detail: "Authentication and messaging", icon: Network, healthId: "express" },
  { name: "NestJS", detail: "GraphQL and domain services", icon: Activity, healthId: "nestjs" },
  { name: "Go API", detail: "Job submission and orchestration", icon: Workflow, healthId: "go" },
  { name: "Go Worker", detail: "Background workload processing and heartbeat", icon: Zap, healthId: "worker" },
  { name: "Python AI", detail: "AI inference and retrieval", icon: Bot, healthId: "python" },
  { name: "Data layer", detail: "MongoDB, PostgreSQL, Redis and RabbitMQ", icon: Database, healthId: "dataLayer" },
];

const shortcuts = [
  {
    title: "AI runs",
    description: "Explore agent execution and outcomes as run data becomes available.",
    path: "/agents",
    icon: Bot,
    tag: "AGENTS",
  },
  {
    title: "Infrastructure",
    description: "Inspect service health and integration readiness.",
    path: "/infrastructure",
    icon: Network,
    tag: "SYSTEMS",
  },
  {
    title: "Jobs & workflows",
    description: "Explore the workspace for queued and processed workloads.",
    path: "/jobs",
    icon: Workflow,
    tag: "PIPELINES",
  },
  {
    title: "Intelligence",
    description: "Open the analytics dashboard and its clearly labeled preview data.",
    path: "/intelligence",
    icon: Activity,
    tag: "ANALYTICS",
  },
];

function SectionTitle({ eyebrow, title, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="relay-eyebrow mb-2">{eyebrow}</p>
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MetricCard({ metric }) {
  const Icon = metric.icon;

  return (
    <article className="relay-panel group relative overflow-hidden rounded-2xl p-5 transition duration-300 hover:-translate-y-0.5 hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-base-content/65">{metric.label}</p>
          <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums">{metric.value}</p>
        </div>
        <span className={`grid size-11 place-items-center rounded-xl ${metric.glow} ${metric.accent}`}>
          <Icon size={20} strokeWidth={1.8} />
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-base-content/30" />
        <p className="text-xs text-base-content/45">{metric.detail}</p>
      </div>
      <div className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition group-hover:opacity-100" />
    </article>
  );
}

export default function OperationsOverview() {
  const [healthStatuses, setHealthStatuses] = useState(INITIAL_HEALTH);
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const [healthLastChecked, setHealthLastChecked] = useState(null);
  const [queuedJobs, setQueuedJobs] = useState({
    value: "—",
    detail: "Loading authenticated job history…",
  });

  const loadQueuedJobs = useCallback(async () => {
    const apiBaseUrl = (
      import.meta.env.VITE_NEST_API_URL ||
      (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin)
    ).replace(/\/+$/, "");

    if (!apiBaseUrl) {
      setQueuedJobs({
        value: "—",
        detail: "NestJS API URL is not configured",
      });
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/jobs?limit=100`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        setQueuedJobs({
          value: "—",
          detail:
            response.status === 401
              ? "Sign in again to view job counts"
              : response.status === 403
                ? "Job history access denied"
                : `Job history unavailable (HTTP ${response.status})`,
        });
        return;
      }

      const payload = await response.json();
      const jobs = Array.isArray(payload?.jobs)
        ? payload.jobs
        : Array.isArray(payload)
          ? payload
          : null;

      if (!jobs) {
        setQueuedJobs({
          value: "—",
          detail: "Unexpected job-history response",
        });
        return;
      }

      const count = jobs.filter(
        (job) => String(job?.status || "").toLowerCase() === "queued",
      ).length;

      setQueuedJobs({
        value: String(count),
        detail: `Queued in your latest ${jobs.length} jobs`,
      });
    } catch (error) {
      setQueuedJobs({
        value: "—",
        detail:
          error instanceof TypeError
            ? "Cannot connect to authenticated job history"
            : "Could not load job history",
      });
    }
  }, []);

  useEffect(() => {
    loadQueuedJobs();
    const interval = setInterval(loadQueuedJobs, 30000);
    return () => clearInterval(interval);
  }, [loadQueuedJobs]);

  const checkHealth = useCallback(async () => {
    setHealthRefreshing(true);

    setHealthStatuses((previous) => ({
      ...previous,
      ...Object.fromEntries(
        [...HEALTH_CHECKS.map(({ id }) => id), "worker", "dataLayer"].map((id) => [
          id,
          { ...previous[id], status: "checking", detail: "Checking health…" },
        ]),
      ),
    }));

    const checkEndpoint = async (id, url, validate = () => true) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const startedAt = Date.now();

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        let data = null;
        try {
          data = await response.json();
        } catch {
          // Invalid or empty JSON is handled as an unsuccessful health check.
        }

        if (!response.ok) {
          return {
            id,
            status: "unavailable",
            detail: `Health endpoint returned HTTP ${response.status}.`,
            data,
          };
        }

        if (!validate(data)) {
          return {
            id,
            status: "unavailable",
            detail: "Health response did not confirm readiness.",
            data,
          };
        }

        return {
          id,
          status: "online",
          detail: `Health check passed in ${Date.now() - startedAt} ms.`,
          data,
        };
      } catch (error) {
        const isNetworkOrCorsError = error instanceof TypeError;
        return {
          id,
          status: error.name === "AbortError"
            ? "unavailable"
            : isNetworkOrCorsError
              ? "unverified"
              : "unavailable",
          detail: error.name === "AbortError"
            ? "Health check timed out after 8 seconds."
            : isNetworkOrCorsError
              ? "Could not verify from the browser. Check service availability and CORS."
              : error.message || "Health check failed.",
          data: null,
        };
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      const apiResults = await Promise.all(
        HEALTH_CHECKS.map(({ id, url }) =>
          checkEndpoint(id, url, (data) => {
            if (!["ok", "ready"].includes(data?.status)) return false;
            if (id === "nestjs" && data?.status !== "ready") return false;
            if (id === "nestjs" && data?.checks?.database !== "ok") return false;
            return true;
          }),
        ),
      );

      const apiById = Object.fromEntries(apiResults.map((result) => [result.id, result]));

      const [redis, rabbitmq] = await Promise.all([
        checkEndpoint(
          "redis",
          "/api/health/redis",
          (data) => data?.status === "ready" && data?.dependency === "redis",
        ),
        checkEndpoint(
          "rabbitmq",
          "/rabbitmqz",
          (data) => data?.status === "ready" && data?.service === "rabbitmq",
        ),
      ]);

      const nest = apiById.nestjs;
      const python = apiById.python;
      const go = apiById.go;

      const mongoStatus =
        nest?.status === "online"
          ? "online"
          : nest?.data?.checks?.database === "unavailable"
            ? "unavailable"
            : "unverified";

      const postgresStatus =
        python?.status === "online"
          ? "online"
          : python?.data?.detail === "Database unavailable"
            ? "unavailable"
            : "unverified";

      const dependencyStates = [
        mongoStatus,
        postgresStatus,
        redis.status,
        rabbitmq.status,
      ];

      const dataLayerStatus = dependencyStates.includes("unavailable")
        ? "unavailable"
        : dependencyStates.every((status) => status === "online")
          ? "online"
          : dependencyStates.includes("checking")
            ? "checking"
            : "unverified";

      const workerStatus =
        go?.status === "online" ? "online" : "unverified";

      const derivedResults = [
        {
          id: "worker",
          status: workerStatus,
          detail: go?.status === "online"
            ? "Go readiness passed, including the worker heartbeat."
            : "Worker readiness could not be confirmed through the Go API.",
        },
        {
          id: "dataLayer",
          status: dataLayerStatus,
          detail: `MongoDB: ${mongoStatus}; PostgreSQL: ${postgresStatus}; Redis: ${redis.status}; RabbitMQ: ${rabbitmq.status}.`,
        },
      ];

      setHealthStatuses((previous) => ({
        ...previous,
        ...Object.fromEntries(
          [...apiResults, ...derivedResults].map(({ id, ...result }) => [
            id,
            result,
          ]),
        ),
      }));

      setHealthLastChecked(new Date());
    } finally {
      setHealthRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();

    const intervalId = setInterval(checkHealth, 30000);

    return () => clearInterval(intervalId);
  }, [checkHealth]);

  const respondingCount = HEALTH_CHECKS.filter(
    ({ id }) => healthStatuses[id]?.status === "online",
  ).length;

  const completedChecks = HEALTH_CHECKS.filter(
    ({ id }) =>
      ["online", "unavailable"].includes(healthStatuses[id]?.status),
  ).length;

  const platformHealthIds = [
    ...HEALTH_CHECKS.map(({ id }) => id),
    "worker",
    "dataLayer",
  ];

  const platformStates = platformHealthIds.map(
    (id) => healthStatuses[id]?.status,
  );

  const allPlatformHealthy = platformStates.every(
    (status) => status === "online",
  );

  const hasUnavailableApi = platformStates.includes("unavailable");

  const platformStatus = allPlatformHealthy
    ? {
        label: "Everything is up and running",
        detail: "All six platform service checks passed.",
        tone: "success",
      }
    : hasUnavailableApi
      ? {
          label: "Some services need attention",
          detail: `${platformStates.filter((status) => status === "online").length} of six platform checks passed. Inspect the service details below.`,
          tone: "warning",
        }
      : {
          label: "Checking platform health",
          detail: "Some checks are pending or could not be verified from the browser.",
          tone: "pending",
        };

  return (
    <div className="mx-auto max-w-[1600px] space-y-7 p-4 sm:space-y-9 sm:p-6 lg:p-8">
      <section className="relay-panel relative isolate overflow-hidden rounded-3xl">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/15 via-transparent to-secondary/5" />
        <div className="pointer-events-none absolute -right-20 -top-36 -z-10 size-96 rounded-full border border-primary/10" />
        <div className="pointer-events-none absolute -right-5 -top-24 -z-10 size-72 rounded-full border border-secondary/10" />
        <div className="pointer-events-none absolute right-16 top-16 -z-10 size-40 rounded-full bg-primary/10 blur-3xl" />

        <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-[1fr_auto] lg:items-end lg:p-11">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-primary">
              <Radio size={14} />
              RELAY / OPERATIONS CENTER
            </div>

            <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl lg:text-5xl">
              Your AI platform.
              <span className="mt-1 block bg-gradient-to-r from-primary via-sky-400 to-secondary bg-clip-text text-transparent">
                One clear view.
              </span>
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-base-content/65 sm:text-base">
              Monitor your service architecture, explore AI workflows, and inspect
              infrastructure readiness from a single operational workspace.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/infrastructure"
                className="relay-glow inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-content transition hover:brightness-110"
              >
                Explore infrastructure <ArrowRight size={16} />
              </Link>
              <Link
                to="/intelligence"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-base-content/15 bg-base-100/40 px-5 py-3 text-sm font-semibold transition hover:border-primary/40 hover:bg-base-100/70"
              >
                Open intelligence
              </Link>
              <button
                type="button"
                onClick={checkHealth}
                disabled={healthRefreshing}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-base-content/15 bg-base-100/40 px-4 py-3 text-sm font-semibold transition hover:border-primary/40 disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw
                  size={15}
                  className={healthRefreshing ? "animate-spin" : ""}
                />
                {healthRefreshing ? "Checking…" : "Refresh health"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:w-56 lg:grid-cols-1">
            <div className="rounded-2xl border border-base-content/10 bg-base-100/50 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-base-content/55">
                <Network size={15} />
                <span className="text-xs">Service health</span>
              </div>
              <p className="mt-3 text-sm font-semibold">
                {healthRefreshing && completedChecks === 0
                  ? "Checking services…"
                  : `${respondingCount} of 4 APIs responding`}
              </p>
              <p className="mt-1 text-xs text-base-content/45">
                {healthLastChecked
                  ? `Last checked ${healthLastChecked.toLocaleTimeString()}`
                  : "Awaiting first health check"}
              </p>
            </div>
            <div className="rounded-2xl border border-base-content/10 bg-base-100/50 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-base-content/55">
                <Activity size={15} />
                <span className="text-xs">Platform telemetry</span>
              </div>
              <p className="mt-3 text-sm font-semibold">Not connected</p>
              <p className="mt-1 text-xs text-base-content/45">Metrics are not fabricated</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-content/10 px-6 py-4 text-xs text-base-content/50 sm:px-9">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary" />
            Live API health checks · 30-second refresh
          </span>
          <span className="font-mono tracking-wide">RELAY / CONTROL PLANE</span>
        </div>
      </section>

      <section
        role="status"
        aria-live="polite"
        className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
          platformStatus.tone === "success"
            ? "border-success/25 bg-success/5"
            : platformStatus.tone === "warning"
              ? "border-warning/30 bg-warning/5"
              : "border-base-300 bg-base-200/40"
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 size-2.5 shrink-0 rounded-full ${
              platformStatus.tone === "success"
                ? "bg-success"
                : platformStatus.tone === "warning"
                  ? "bg-warning"
                  : "animate-pulse bg-primary"
            }`}
          />
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              {platformStatus.label}
            </h2>
            <p className="mt-1 text-xs leading-5 text-base-content/60">
              {platformStatus.detail}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-base-content/50">
          {healthRefreshing
            ? "Refreshing checks…"
            : healthLastChecked
              ? `Last checked ${healthLastChecked.toLocaleTimeString()}`
              : "Initial check pending"}
        </span>
      </section>

      <IncidentResponsePanel />

      <section>
        <SectionTitle eyebrow="Platform signals" title="Operational snapshot">
          <Badge
            variant="warning"
            dot
            className="rounded-full border border-base-300 bg-base-100 px-3 py-2 text-[11px] text-base-content/55"
          >
            Telemetry pending
          </Badge>
        </SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {buildMetrics(queuedJobs).map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card as="article" unstyled className="relay-panel rounded-2xl">
          <SectionTitle eyebrow="Architecture" title="Platform services">
            <Link to="/infrastructure" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition hover:gap-2.5">
              Inspect services <ArrowRight size={14} />
            </Link>
          </SectionTitle>

          <div className="divide-y divide-base-300/70">
            {services.map(({ name, detail, icon: Icon, healthId }, index) => {
              const health = healthId ? healthStatuses[healthId] : null;
              const label =
                health?.status === "online"
                  ? "Responding"
                  : health?.status === "unavailable"
                    ? "Unavailable"
                    : health?.status === "checking"
                      ? "Checking"
                      : "Unverified";
              const badgeVariant =
                health?.status === "online"
                  ? "success"
                  : health?.status === "unavailable"
                    ? "warning"
                    : "neutral";

              return (
              <div key={name} className="group flex items-center gap-3 py-4 first:pt-1 last:pb-1">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-base-300/70 bg-base-200/70 text-base-content/65 transition group-hover:border-primary/25 group-hover:text-primary">
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="mt-1 text-xs leading-5 text-base-content/50">{detail}</p>
                </div>
                <Badge
                  variant={badgeVariant}
                  size="sm"
                  dot
                  className="shrink-0 rounded-full border border-base-300 px-2.5 py-1.5 text-[10px] text-base-content/50"
                >
                  {label}
                </Badge>
                <span className="hidden font-mono text-[10px] text-base-content/30 sm:block">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              );
            })}
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-base-300/70 bg-base-200/40 p-4">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-base-content/40" />
            <p className="text-xs leading-5 text-base-content/55">
              {completedChecks} of four HTTP API checks have completed.
              Worker readiness is inferred from the Go API heartbeat; the data
              layer combines MongoDB, PostgreSQL, Redis and RabbitMQ checks.
              {healthLastChecked
                ? ` Last checked at ${healthLastChecked.toLocaleTimeString()}.`
                : ""} Browser CORS restrictions can prevent dependency checks
              from being verified.
            </p>
          </div>
        </Card>

        <article className="relay-panel rounded-2xl p-5 sm:p-6">
          <SectionTitle eyebrow="Explore the platform" title="Operations workspace" />
          <div className="space-y-3">
            {shortcuts.map(({ title, description, path, icon: Icon, tag }) => (
              <Link
                key={path}
                to={path}
                className="group flex items-center gap-3 rounded-xl border border-base-300/80 bg-base-100/40 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-base-200/60"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-content">
                  <Icon size={19} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{title}</span>
                    <span className="rounded-md bg-base-200 px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-base-content/45">
                      {tag}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-base-content/55">
                    {description}
                  </span>
                </span>
                <ArrowRight size={16} className="shrink-0 text-base-content/30 transition group-hover:translate-x-1 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="relay-panel rounded-2xl p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary/10 text-secondary">
            <Clock3 size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="relay-eyebrow mb-2">Integration roadmap</p>
            <h2 className="text-base font-semibold">Connect the signals behind your platform</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-base-content/55">
              Connect request metrics, latency measurements, queue depth, error
              rates, and AI execution history to populate this control center with
              verified operational data.
            </p>
          </div>
          <Link
            to="/infrastructure"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl border border-base-300 px-4 py-2.5 text-sm font-medium transition hover:border-primary/40 hover:text-primary"
          >
            Review infrastructure <ArrowDownRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
