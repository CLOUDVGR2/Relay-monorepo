/** UI component for OperationsOverview in the Relay web application. */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card } from "../components/ui";
import IncidentResponsePanel from "./IncidentResponsePanel";
import {
  countCompletedHealthChecks,
  getPlatformHealthSummary,
} from "./operations-overview.utils";
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

const GATEWAY_HEALTH_CHECK = {
  id: "gateway",
  url: "/gateway/healthz",
};

const WORKER_DEFINITIONS = [
  { id: "goWorker", name: "go-worker" },
  { id: "recordingWorker", name: "recording-worker" },
  { id: "multiAgentWorker", name: "multi-agent-worker" },
];

const DATA_SERVICE_IDS = ["mongo", "postgres", "redis", "rabbitmq"];

const INITIAL_HEALTH = Object.fromEntries(
  [
    GATEWAY_HEALTH_CHECK.id,
    ...HEALTH_CHECKS.map(({ id }) => id),
    ...WORKER_DEFINITIONS.map(({ id }) => id),
    ...DATA_SERVICE_IDS,
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
  { name: "Relay Gateway", detail: "Reverse proxy and API routing", icon: Network, healthId: "gateway", category: "Gateway" },
  { name: "Express API", detail: "Authentication and messaging", icon: Network, healthId: "express", category: "APIs" },
  { name: "NestJS API", detail: "GraphQL services and MongoDB readiness", icon: Activity, healthId: "nestjs", category: "APIs" },
  { name: "Go API", detail: "Job submission and RabbitMQ publisher", icon: Workflow, healthId: "go", category: "APIs" },
  { name: "Python AI", detail: "AI service and PostgreSQL readiness", icon: Bot, healthId: "python", category: "APIs" },
  { name: "Go Jobs Worker", detail: "RabbitMQ job consumption and Redis heartbeat", icon: Zap, healthId: "goWorker", category: "Workers" },
  { name: "Recording Worker", detail: "Background call-recording processing", icon: Activity, healthId: "recordingWorker", category: "Workers" },
  { name: "Multi-Agent Worker", detail: "Background multi-agent task execution", icon: Bot, healthId: "multiAgentWorker", category: "Workers" },
  { name: "MongoDB", detail: "Database readiness through NestJS", icon: Database, healthId: "mongo", category: "Data services" },
  { name: "PostgreSQL", detail: "Database readiness through Python AI", icon: Database, healthId: "postgres", category: "Data services" },
  { name: "Redis", detail: "Dedicated Redis dependency probe", icon: Database, healthId: "redis", category: "Data services" },
  { name: "RabbitMQ", detail: "Dedicated RabbitMQ publisher probe", icon: Network, healthId: "rabbitmq", category: "Data services" },
];

const serviceGroups = [
  {
    name: "Gateway",
    description: "External traffic routing",
    services: services.filter((service) => service.category === "Gateway"),
  },
  {
    name: "APIs",
    description: "Application and AI service endpoints",
    services: services.filter((service) => service.category === "APIs"),
  },
  {
    name: "Workers",
    description: "Background processing and execution",
    services: services.filter((service) => service.category === "Workers"),
  },
  {
    name: "Data services",
    description: "Databases, cache, and messaging",
    services: services.filter((service) => service.category === "Data services"),
  },
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
    <article className="relay-panel relative overflow-hidden rounded-2xl p-5">
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
        [
          GATEWAY_HEALTH_CHECK.id,
          ...HEALTH_CHECKS.map(({ id }) => id),
          ...WORKER_DEFINITIONS.map(({ id }) => id),
          ...DATA_SERVICE_IDS,
          "dataLayer",
        ].map((id) => [
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

    const checkDependency = async (id, url, identityKey, identityValue) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const data = await response.json().catch(() => null);
        const identityMatches = data?.[identityKey] === identityValue;

        if (
          response.ok &&
          data?.status === "ready" &&
          identityMatches
        ) {
          return {
            id,
            status: "online",
            detail: `${id === "redis" ? "Redis" : "RabbitMQ"} dependency check passed.`,
            data,
          };
        }

        if (
          response.status === 503 &&
          data?.status === "unavailable" &&
          identityMatches
        ) {
          return {
            id,
            status: "unavailable",
            detail: `${id === "redis" ? "Redis" : "RabbitMQ"} reported unavailable.`,
            data,
          };
        }

        return {
          id,
          status: "unverified",
          detail: "Dependency response did not confirm readiness or an explicit unavailable state.",
          data,
        };
      } catch (error) {
        return {
          id,
          status: "unverified",
          detail: error.name === "AbortError"
            ? "Dependency check timed out; availability could not be verified."
            : "Could not verify dependency availability from the browser. Check service availability and CORS.",
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

      const [gateway, redis, rabbitmq] = await Promise.all([
        checkEndpoint(
          GATEWAY_HEALTH_CHECK.id,
          GATEWAY_HEALTH_CHECK.url,
          (data) => ["ok", "ready"].includes(data?.status),
        ),
        checkDependency("redis", "/api/health/redis", "dependency", "redis"),
        checkDependency("rabbitmq", "/rabbitmqz", "service", "rabbitmq"),
      ]);

      const nest = apiById.nestjs;
      const python = apiById.python;

      const mongo = {
        status: nest?.status === "online"
          ? "online"
          : nest?.data?.checks?.database === "unavailable"
            ? "unavailable"
            : "unverified",
        detail: nest?.status === "online"
          ? "MongoDB readiness confirmed through NestJS."
          : "MongoDB could not be independently confirmed because NestJS readiness did not pass.",
      };

      const postgres = {
        status: python?.status === "online" ? "online" : "unverified",
        detail: python?.status === "online"
          ? "PostgreSQL SELECT 1 passed through Python AI readiness."
          : "PostgreSQL could not be confirmed through Python AI readiness. This does not by itself prove PostgreSQL is down.",
      };

      const workerStatuses = {};
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
          const response = await fetch("/go/worker-health", {
            method: "GET",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          });
          const data = await response.json().catch(() => null);

          if (!response.ok || !Array.isArray(data?.workers)) {
            throw new Error(
              `Worker health endpoint returned HTTP ${response.status} or an invalid response.`,
            );
          }

          const workersByName = new Map(
            data.workers.map((worker) => [worker.worker, worker]),
          );
          const knownStatuses = new Set([
            "online", "idle", "processing", "starting", "degraded",
            "stopping", "stale", "missing", "unknown",
          ]);

          for (const definition of WORKER_DEFINITIONS) {
            const worker = workersByName.get(definition.name);

            if (!worker) {
              workerStatuses[definition.id] = {
                status: "unknown",
                detail: "Worker was not included in the health snapshot.",
              };
              continue;
            }

            const status = knownStatuses.has(worker.status)
              ? worker.status
              : "unknown";
            const observations = [];

            if (worker.updated_at) {
              const updatedAt = new Date(worker.updated_at);
              observations.push(
                Number.isNaN(updatedAt.getTime())
                  ? `Heartbeat timestamp: ${worker.updated_at}`
                  : `Heartbeat updated ${updatedAt.toLocaleString()}`,
              );
            }

            if (worker.last_poll_at) {
              const lastPoll = new Date(worker.last_poll_at);
              observations.push(
                Number.isNaN(lastPoll.getTime())
                  ? `Last poll: ${worker.last_poll_at}`
                  : `Last completed poll ${lastPoll.toLocaleString()}`,
              );
            }

            if (worker.last_poll_error) {
              observations.push(`Last poll error: ${worker.last_poll_error}`);
            }

            workerStatuses[definition.id] = {
              status,
              detail: observations.length
                ? observations.join(" · ")
                : `Worker heartbeat status: ${status}.`,
            };
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        const detail = error.name === "AbortError"
          ? "Worker health snapshot timed out; worker states are unverified."
          : `Worker health snapshot could not be retrieved: ${error.message || "request failed"}`;

        for (const definition of WORKER_DEFINITIONS) {
          workerStatuses[definition.id] = {
            status: "unverified",
            detail,
          };
        }
      }

      const dependencyStatuses = {
        mongo,
        postgres,
        redis,
        rabbitmq,
      };
      const dependencyValues = Object.values(dependencyStatuses);
      const dataLayerStatus = dependencyValues.some(
        (dependency) => dependency.status === "unavailable",
      )
        ? "unavailable"
        : dependencyValues.every(
            (dependency) => dependency.status === "online",
          )
          ? "online"
          : "unverified";

      setHealthStatuses((previous) => ({
        ...previous,
        ...Object.fromEntries(
          [...apiResults, gateway].map(({ id, ...result }) => [id, result]),
        ),
        ...workerStatuses,
        ...Object.fromEntries(
          Object.entries(dependencyStatuses).map(([id, result]) => [id, result]),
        ),
        dataLayer: {
          status: dataLayerStatus,
          detail: `MongoDB: ${mongo.status}; PostgreSQL: ${postgres.status}; Redis: ${redis.status}; RabbitMQ: ${rabbitmq.status}.`,
        },
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

  const platformHealthIds = [
    GATEWAY_HEALTH_CHECK.id,
    ...HEALTH_CHECKS.map(({ id }) => id),
    ...WORKER_DEFINITIONS.map(({ id }) => id),
    ...DATA_SERVICE_IDS,
  ];

  const completedChecks = countCompletedHealthChecks(
    healthStatuses,
    HEALTH_CHECKS.map(({ id }) => id),
  );

  const platformStatus = getPlatformHealthSummary(
    Object.fromEntries(
      platformHealthIds.map((id) => {
        const status = healthStatuses[id]?.status;
        const normalizedStatus = ["idle", "processing"].includes(status)
          ? "online"
          : ["degraded", "stale", "missing"].includes(status)
            ? "unavailable"
            : ["starting", "stopping", "unknown"].includes(status)
              ? "unverified"
              : status;
        return [id, normalizedStatus];
      }),
    ),
  );

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
            Automated service health checks · refresh every 30 seconds
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
                  : `${healthRefreshing ? "animate-pulse " : ""}bg-primary`
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

          <div className="grid gap-4 md:grid-cols-2">
            {serviceGroups.map(({ name: groupName, description, services: groupServices }) => (
              <section
                key={groupName}
                aria-label={`${groupName} services`}
                className="min-w-0 rounded-2xl border border-base-300/70 bg-base-200/20 p-4 sm:p-5"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">{groupName}</h3>
                    <p className="mt-1 text-xs text-base-content/45">{description}</p>
                  </div>
                  <span className="rounded-full border border-base-300 bg-base-100 px-2.5 py-1 font-mono text-[10px] text-base-content/55">
                    {String(groupServices.length).padStart(2, "0")}
                  </span>
                </div>

                <div className="divide-y divide-base-300/60">
                  {groupServices.map(({ name, detail, icon: Icon, healthId }) => {
                    const health = healthStatuses[healthId];
                    const rawStatus = health?.status || "checking";
                    const label = rawStatus === "online"
                      ? "Online"
                      : rawStatus === "unavailable"
                        ? "Unavailable"
                        : rawStatus === "unverified"
                          ? "Unverified"
                          : rawStatus === "checking"
                            ? "Checking"
                            : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
                    const badgeVariant = ["online", "idle", "processing"].includes(rawStatus)
                      ? "success"
                      : ["unavailable", "missing", "degraded", "stale"].includes(rawStatus)
                        ? "warning"
                        : "neutral";

                    return (
                      <div key={healthId} className="flex min-w-0 items-start gap-3 py-3 first:pt-2 last:pb-1">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-base-300/70 bg-base-100/70 text-base-content/65">
                          <Icon size={17} strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{name}</p>
                          <p className="mt-1 text-xs leading-5 text-base-content/50">{detail}</p>
                          {health?.detail ? (
                            <p className="mt-1 break-words text-[11px] leading-5 text-base-content/40">
                              {health.detail}
                            </p>
                          ) : null}
                        </div>
                        <Badge
                          variant={badgeVariant}
                          size="sm"
                          dot
                          className="mt-0.5 shrink-0 rounded-full border border-base-300 px-2 py-1 text-[10px] text-base-content/55"
                        >
                          {label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-base-300/70 bg-base-200/40 p-4">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-base-content/40" />
            <p className="text-xs leading-5 text-base-content/55">
              {completedChecks} of four HTTP API checks have completed.
              The gateway is checked separately. Three workers are reported by
              the worker-health snapshot. MongoDB and PostgreSQL are verified
              through their respective API readiness checks; Redis and RabbitMQ
              use dedicated probes.
              {healthLastChecked
                ? ` Last checked at ${healthLastChecked.toLocaleTimeString()}.`
                : ""} Browser CORS restrictions can prevent endpoint checks
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
