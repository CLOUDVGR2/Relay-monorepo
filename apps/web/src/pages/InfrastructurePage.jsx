/** Page component for InfrastructurePage in the Relay web application. */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";

const SERVICES = [
  {
    id: "gateway",
    checkType: "liveness",
    title: "Relay Gateway",
    description: "Reverse proxy and API routing health",
    url: "/gateway/healthz",
    icon: Server,
  },
  {
    id: "express",
    checkType: "readiness",
    title: "Express API",
    description: "Authentication, messaging, and database readiness",
    url: import.meta.env.VITE_EXPRESS_HEALTH_URL || "/api/health/ready",
    icon: Wifi,
  },
  {
    id: "nestjs",
    checkType: "readiness",
    title: "NestJS API",
    description: "GraphQL services and MongoDB readiness",
    url: import.meta.env.VITE_NEST_HEALTH_URL || (import.meta.env.DEV ? "http://127.0.0.1:3000/health/ready" : "/health/ready"),
    icon: Activity,
  },
  {
    id: "go",
    checkType: "readiness",
    title: "Go API",
    description: "Job submission and RabbitMQ publisher readiness",
    url: import.meta.env.VITE_GO_HEALTH_URL || "/go/readyz",
    icon: Server,
  },
  {
    id: "worker",
    title: "Go Worker",
    description: "RabbitMQ and Redis background processing",
    icon: ArrowUpRight,
  },
  {
    id: "python",
    checkType: "readiness",
    title: "Python AI",
    description: "AI service and database readiness",
    url: import.meta.env.VITE_PYTHON_AI_HEALTH_URL || "/python/readyz",
    icon: ShieldCheck,
  },
];

const INITIAL_STATUSES = Object.fromEntries(
  SERVICES.map((service) => [
    service.id,
    {
      status: "checking",
      detail: service.url
        ? "Waiting for health check."
        : service.id === "worker"
          ? "No direct health endpoint is configured; process state alone does not confirm job consumption."
          : "No direct HTTP health endpoint is configured.",
    },
  ]),
);

async function probeDependency(url, dependency) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const data = await response.json().catch(() => null);
    const identifiesDependency =
      dependency === "redis"
        ? data?.dependency === "redis"
        : data?.service === "rabbitmq";

    if (
      response.ok &&
      data?.status === "ready" &&
      identifiesDependency
    ) {
      return {
        status: "online",
        detail: `${dependency === "redis" ? "Redis PING" : "RabbitMQ publisher"} check passed independently.`,
      };
    }

    if (
      !response.ok &&
      response.status === 503 &&
      data?.status === "unavailable" &&
      identifiesDependency
    ) {
      return {
        status: "unavailable",
        detail: `The dedicated ${dependency} probe explicitly reported the dependency unavailable.`,
      };
    }

    return {
      status: "unverified",
      detail: `The ${dependency} endpoint did not return a conclusive dependency-specific result (HTTP ${response.status}).`,
    };
  } catch (error) {
    return {
      status: "unverified",
      detail:
        error.name === "AbortError"
          ? `The ${dependency} probe timed out; its state is unverified.`
          : `The ${dependency} probe could not be reached; this does not prove the dependency is down.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function StatusBadge({ status }) {
  const styles = {
    online: "border-success/25 bg-success/10 text-success",
    checking: "border-info/25 bg-info/10 text-info",
    unavailable: "border-error/25 bg-error/10 text-error",
    unverified: "border-base-300 bg-base-200 text-base-content",
  };

  const labels = {
    online: "Responding",
    checking: "Checking",
    unavailable: "Unavailable",
    unverified: "Unverified",
  };

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        styles[status] || styles.unverified
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          status === "online"
            ? "bg-success"
            : status === "checking"
              ? "animate-pulse bg-info"
              : status === "unavailable"
                ? "bg-error"
                : "bg-base-content/40"
        }`}
      />
      {labels[status] || "Unverified"}
    </span>
  );
}

function ServiceCard({ icon: Icon, title, description, status, detail }) {
  return (
    <article className="group rounded-2xl border border-base-300 bg-base-100 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg hover:shadow-primary/5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="grid size-11 place-items-center rounded-xl border border-base-300 bg-base-200/70">
          <Icon size={20} className="text-primary" />
        </div>
        <StatusBadge status={status} />
      </div>
      <h2 className="mt-5 text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-base-content/55">{description}</p>
      <div className="mt-5 border-t border-base-300 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/40">
          Latest observation
        </p>
        <p className="mt-1 break-words text-sm text-base-content/75">{detail}</p>
      </div>
    </article>
  );
}

export default function InfrastructurePage() {
  const [serviceStatuses, setServiceStatuses] = useState(INITIAL_STATUSES);
  const [lastChecked, setLastChecked] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkHealth = useCallback(async () => {
    setRefreshing(true);
    setServiceStatuses((previous) => ({
      ...previous,
      ...Object.fromEntries(
        SERVICES.filter((service) => service.url).map((service) => [
          service.id,
          {
            status: "checking",
            detail: "Checking health endpoint…",
          },
        ]),
      ),
      database: {
        status: "checking",
        detail: "Checking MongoDB through NestJS readiness…",
      },
      postgres: {
        status: "checking",
        detail: "Checking PostgreSQL through Python AI readiness…",
      },
      redis: {
        status: "checking",
        detail: "Checking Redis-backed job readiness through the Go API…",
      },
      rabbitmq: {
        status: "checking",
        detail: "Checking RabbitMQ publisher readiness through the Go API…",
      },
    }));

    try {
      const results = await Promise.all(
        SERVICES.filter((service) => service.url).map(async (service) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const startedAt = Date.now();

          let database = null;

          try {
            const response = await fetch(service.url, {
              method: "GET",
              signal: controller.signal,
              headers: { Accept: "application/json" },
            });

            const data = await response.json().catch(() => null);

            if (service.id === "nestjs") {
              if (
                response.ok &&
                data?.status === "ready" &&
                data?.checks?.database === "ok"
              ) {
                database = {
                  status: "online",
                  detail: `MongoDB ping succeeded in ${Date.now() - startedAt} ms (via NestJS readiness).`,
                };
              } else if (data?.checks?.database === "unavailable") {
                database = {
                  status: "unavailable",
                  detail: "NestJS reported that MongoDB is unavailable.",
                };
              } else {
                database = {
                  status: "unverified",
                  detail: "NestJS did not provide a confirmed MongoDB readiness result.",
                };
              }
            }

            if (!response.ok) {
              throw new Error(`Health endpoint returned HTTP ${response.status}`);
            }

            if (!["ok", "ready"].includes(data?.status)) {
              throw new Error(`Unexpected health response status: ${String(data?.status ?? "missing")}`);
            }

            if (
              service.id === "nestjs" &&
              (data.status !== "ready" || data.checks?.database !== "ok")
            ) {
              throw new Error("NestJS database readiness check did not pass.");
            }

            return {
              id: service.id,
              status: "online",
              detail: `${service.checkType === "readiness" ? "Readiness" : "Liveness"} check passed in ${Date.now() - startedAt} ms.`,
              database,
            };
          } catch (error) {
            return {
              id: service.id,
              status: "unavailable",
              detail:
                error.name === "AbortError"
                  ? "Health check timed out after 8 seconds."
                  : error instanceof TypeError
                    ? "Could not reach endpoint. Check that the service is running and allows frontend CORS requests."
                    : error.message || "Health check failed.",
              database: service.id === "nestjs"
                ? database || {
                    status: "unverified",
                    detail: "MongoDB could not be verified because NestJS readiness could not be reached.",
                  }
                : null,
            };
          } finally {
            clearTimeout(timeout);
          }
        }),
      );

      const nestResult = results.find((result) => result.id === "nestjs");
      const goResult = results.find((result) => result.id === "go");
      const pythonResult = results.find((result) => result.id === "python");

      const postgresStatus = pythonResult?.status === "online"
        ? {
            status: "online",
            detail: "PostgreSQL SELECT 1 passed through Python AI readiness.",
          }
        : {
            status: "unverified",
            detail: "PostgreSQL could not be confirmed through Python AI readiness. This does not by itself prove PostgreSQL is down.",
          };

      const [redisStatus, rabbitmqStatus] = await Promise.all([
        probeDependency(
          "/api/health/redis",
          "redis",
        ),
        probeDependency(
          "/rabbitmqz",
          "rabbitmq",
        ),
      ]);

      const workerStatus = goResult?.status === "online"
        ? {
            status: "online",
            detail: "Go API readiness passed, including a fresh Redis worker heartbeat. This verifies worker-session readiness, not successful processing of every job.",
          }
        : goResult?.status === "unavailable"
          ? {
              status: "unverified",
              detail: "Worker readiness could not be confirmed because Go API readiness failed. The cause may be RabbitMQ publishing, the Redis job store, or the worker heartbeat.",
            }
          : {
              status: "checking",
              detail: "Waiting for the Go API readiness check, which also verifies the worker heartbeat.",
            };

      setServiceStatuses((previous) => ({
        ...previous,
        ...Object.fromEntries(
          results.map(({ id, status, detail }) => [
            id,
            { status, detail },
          ]),
        ),
        worker: workerStatus,
        postgres: postgresStatus,
        redis: redisStatus,
        rabbitmq: rabbitmqStatus,
        ...(nestResult?.database ? { database: nestResult.database } : {}),
      }));
      setLastChecked(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();

    const intervalId = setInterval(checkHealth, 30000);

    return () => clearInterval(intervalId);
  }, [checkHealth]);

  const apiServices = SERVICES.filter(
    (service) => service.url && service.id !== "gateway",
  );

  const respondingCount = apiServices.filter(
    (service) => serviceStatuses[service.id]?.status === "online",
  ).length;

  const checkedCount = apiServices.filter(
    (service) =>
      ["online", "unavailable"].includes(serviceStatuses[service.id]?.status),
  ).length;

  const allApisHealthy = checkedCount === 4 && respondingCount === 4;
  const allChecksHealthy =
    allApisHealthy && serviceStatuses.gateway?.status === "online";
  const hasUnavailableService = SERVICES.some(
    (service) =>
      service.url &&
      serviceStatuses[service.id]?.status === "unavailable",
  );

  const platformStatus = allChecksHealthy
    ? {
        title: "All health checks passed",
        detail: "All four HTTP APIs and the Relay Gateway are responding to health checks.",
        tone: "success",
      }
    : hasUnavailableService
      ? {
          title: "Attention required",
          detail: `${respondingCount} of 4 HTTP APIs are responding. Review the affected API and gateway health cards below.`,
          tone: "warning",
        }
      : {
          title: "Monitoring platform health",
          detail: "The operational status will update as health checks complete.",
          tone: "pending",
        };

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-7 lg:p-10">
      <section className="relative overflow-hidden rounded-3xl border border-base-300 bg-base-100">
        <div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 right-1/4 size-64 rounded-full bg-info/10 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-7 p-6 sm:p-9 xl:flex-row xl:items-end">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-200/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.17em] text-base-content">
              <Activity size={13} className="text-primary" />
              Platform observability
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Infrastructure<span className="text-primary">.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-base-content sm:text-base">
              A live view of API readiness, database connectivity, and
              background processing verification across your platform.
            </p>
          </div>

          <button
            type="button"
            onClick={checkHealth}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-content transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Checking services..." : "Refresh health"}
          </button>
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
              {platformStatus.title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-base-content/60">
              {platformStatus.detail}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-base-content/50">
          {refreshing
            ? "Refreshing checks…"
            : lastChecked
              ? `Last checked ${lastChecked.toLocaleTimeString()}`
              : "Initial check pending"}
        </span>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Server size={19} />
            </div>
            <span className="text-sm text-base-content/55">HTTP APIs responding</span>
          </div>
          <p className="mt-5 text-2xl font-semibold tracking-tight">
            {respondingCount} <span className="text-base font-normal text-base-content/50">/ 4</span>
          </p>
          <p className="mt-1 text-xs text-base-content/45">
            {checkedCount} of four API health endpoints checked.
          </p>
        </div>

        <div className="rounded-2xl border border-base-300 bg-base-100 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-info/10 text-info">
              <Clock3 size={19} />
            </div>
            <span className="text-sm text-base-content/55">Last health check</span>
          </div>
          <p className="mt-5 text-xl font-semibold tracking-tight">
            {lastChecked ? lastChecked.toLocaleTimeString() : "Checking…"}
          </p>
          <p className="mt-1 text-xs text-base-content/45">
            Times reflect checks made by this browser.
          </p>
        </div>

        <div className="rounded-2xl border border-base-300 bg-base-100 p-5 sm:col-span-2 xl:col-span-1">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-success/10 text-success">
              <ShieldCheck size={19} />
            </div>
            <span className="text-sm text-base-content/55">Microservices</span>
          </div>
          <p className="mt-5 text-2xl font-semibold tracking-tight">5</p>
          <p className="mt-1 text-xs text-base-content/45">
            Four HTTP APIs and one background worker.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Service inventory
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              Connected services
            </h2>
          </div>
          <p className="text-xs text-base-content/45">
            {lastChecked
              ? `Last checked ${lastChecked.toLocaleTimeString()}`
              : "Awaiting first check"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {SERVICES.map((service) => (
            <ServiceCard
              key={service.id}
              icon={service.icon}
              title={service.title}
              description={service.description}
              status={
                service.id === "worker"
                  ? serviceStatuses.worker?.status || "checking"
                  : service.url
                    ? serviceStatuses[service.id]?.status || "checking"
                    : "unverified"
              }
              detail={serviceStatuses[service.id]?.detail || "Awaiting health check."}
            />
          ))}
          <ServiceCard
            icon={Server}
            title="Data layer"
            description="MongoDB, PostgreSQL, Redis, and RabbitMQ"
            status={
              serviceStatuses.database?.status === "unavailable"
                ? "unavailable"
                : [
                    serviceStatuses.database?.status,
                    serviceStatuses.postgres?.status,
                    serviceStatuses.redis?.status,
                    serviceStatuses.rabbitmq?.status,
                  ].every((status) => status === "online")
                  ? "online"
                  : "unverified"
            }
            detail={[
              `MongoDB: ${serviceStatuses.database?.status || "checking"}`,
              `PostgreSQL: ${serviceStatuses.postgres?.status || "checking"}`,
              `Redis: ${serviceStatuses.redis?.status || "checking"}`,
              `RabbitMQ: ${serviceStatuses.rabbitmq?.status || "checking"}`,
              "Redis and RabbitMQ are checked through their dedicated HTTP probes.",
            ].join(" · ")}
          />
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-base-300 bg-base-200/50 p-4">
        {allChecksHealthy ? (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />
        ) : (
          <WifiOff size={18} className="mt-0.5 shrink-0 text-base-content/45" />
        )}
        <div>
          <p className="text-sm font-semibold">Health-check scope</p>
          <p className="mt-1 text-xs leading-6 text-base-content/55">
            Express, NestJS, Go API, and Python AI are checked independently.
            MongoDB is checked through the NestJS database ping, and PostgreSQL
            through Python AI readiness. Redis and RabbitMQ use dedicated HTTP probes.
            Go API readiness also checks its publisher, Redis-backed job store,
            and worker heartbeat. These checks do not guarantee every job succeeds.
            Browser checks may require each API to allow the frontend origin through CORS.
          </p>
        </div>
      </div>

      {SERVICES.some(
        (service) =>
          service.url &&
          serviceStatuses[service.id]?.status === "unavailable",
      ) && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-warning/25 bg-warning/5 p-4 text-sm"
        >
          <AlertCircle size={19} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">Some health checks failed</p>
            <p className="mt-1 leading-6 text-base-content/65">
              Check that the affected service is running, its port is correct,
              and its CORS policy permits requests from the frontend.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
