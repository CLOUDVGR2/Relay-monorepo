/** Page component for JobsPage in the Relay web application. */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Workflow,
  XCircle,
  CalendarClock,
} from "lucide-react";

const API_BASE_URL = (
  window.location.origin
).replace(/\/+$/, "");

const STATUS_STYLES = {
  queued: "border-info/25 bg-info/10 text-info",
  processing: "border-primary/25 bg-primary/10 text-primary",
  completed: "border-success/25 bg-success/10 text-success",
  failed: "border-error/25 bg-error/10 text-error",
};

function formatDate(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalizeJobs(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return null;
}

function StatusBadge({ status }) {
  const normalized = String(status || "unknown").trim().toLowerCase();

  const styles =
    STATUS_STYLES[normalized] ||
    "border-base-300 bg-base-200 text-base-content/70";

  const Icon =
    normalized === "completed"
      ? CheckCircle2
      : normalized === "failed"
        ? XCircle
        : normalized === "processing"
            ? LoaderCircle
            : Clock3;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${styles}`}
    >
      <Icon
        size={13}
        className={normalized === "processing" ? "animate-spin" : ""}
      />
      {normalized}
    </span>
  );
}

export default function JobsPage() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState(null);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadJobHistory = useCallback(async (manualRefresh = false) => {
    if (!API_BASE_URL) {
      setHistoryError("The NestJS API URL is not configured.");
      setLoadingHistory(false);
      setRefreshing(false);
      return;
    }

    if (manualRefresh) {
      setRefreshing(true);
    } else {
      setLoadingHistory(true);
    }

    setHistoryError("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/jobs?limit=50`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
        },
      );

      if (!response.ok) {
        const messages = {
          401: "Your session may have expired. Sign in again to view your jobs.",
          403: "You are not authorized to view this job history.",
          429: "Too many requests. Wait a moment and refresh.",
          502: "The job service returned an invalid response.",
          503: "The job service is temporarily unavailable.",
        };

        throw new Error(
          messages[response.status] ||
            "Could not load job history. Please try again.",
        );
      }

      const payload = await response.json();
      const jobs = normalizeJobs(payload);

      if (!jobs) {
        throw new Error("The API returned an unexpected job-history format.");
      }

      // The API already returns newest-created jobs first; preserve that order.
      setHistory(jobs);
      setLastUpdated(new Date());
    } catch (err) {
      setHistoryError(
        err instanceof TypeError
          ? "Could not connect to NestJS. Check the API URL, server, and CORS settings."
          : err.message || "Could not load job history.",
      );
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadJobHistory();

    const intervalId = window.setInterval(() => {
      loadJobHistory(true);
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [loadJobHistory]);

  async function submitJob(event) {
    event.preventDefault();

    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setError("Enter a message before submitting the job.");
      return;
    }

    if (trimmedMessage.length > 10000) {
      setError("The message must be 10,000 characters or fewer.");
      return;
    }

    if (!API_BASE_URL) {
      setError(
        "The NestJS API URL is not configured. Set VITE_NEST_API_URL for this deployment.",
      );
      return;
    }

    setSubmitting(true);
    setError("");
    setJob(null);

    try {
      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          type: "welcome",
          message: trimmedMessage,
        }),
      });

      let payload;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        const safeMessages = {
          400: "The job request was invalid. Check the message and try again.",
          401: "Your session may have expired. Sign in again and retry.",
          403: "You are not authorized to submit this job.",
          429: "Too many requests. Wait a moment before trying again.",
          502: "The job service returned an invalid response.",
          503: "The job queue is temporarily unavailable. Try again later.",
        };

        throw new Error(
          safeMessages[response.status] ||
            "The job could not be submitted. Please try again.",
        );
      }

      if (
        !payload ||
        typeof payload.id !== "string" ||
        !payload.id.trim() ||
        payload.status !== "queued"
      ) {
        throw new Error("The API response did not contain a valid queued job.");
      }

      setJob({
        id: payload.id,
        status: payload.status,
      });
      setMessage("");

      await loadJobHistory(true);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Could not connect to NestJS. Check that the API is running and its URL and CORS settings are configured."
          : err.message || "The job could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const completedCount = history.filter(
    (item) => item.status === "completed",
  ).length;

  const failedCount = history.filter(
    (item) => item.status === "failed",
  ).length;

  const activeCount = history.filter((item) =>
    ["queued", "processing"].includes(
      String(item.status || "").trim().toLowerCase(),
    ),
  ).length;

  const filteredJobs = history.filter((item) => {
    const normalizedStatus = String(item.status || "unknown")
      .trim()
      .toLowerCase();
    const query = search.trim().toLowerCase();
    const matchesStatus =
      statusFilter === "all" || normalizedStatus === statusFilter;
    const matchesSearch =
      !query ||
      [item.id, item.type, item.status, item.error]
        .some((value) => String(value || "").toLowerCase().includes(query));

    return matchesStatus && matchesSearch;
  });

  return (
    <main className="mx-auto max-w-[1440px] space-y-7 px-4 py-7 text-base-content sm:px-6 lg:px-9 lg:py-10">
      <header>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-base-content">
          Background operations
        </p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <Workflow size={23} />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Jobs &amp; Workflows
            </h1>
          </div>

          <button
            type="button"
            onClick={() => loadJobHistory(true)}
            disabled={refreshing || loadingHistory}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-100 px-4 py-2 text-sm font-medium transition hover:border-primary/40 hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={refreshing ? "animate-spin" : ""}
            />
            Refresh history
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm leading-6 text-base-content">
            Submit welcome jobs and monitor their queue status, processing
            attempts, completion, and failures.
          </p>
          <p className="text-xs text-base-content/50">
            {lastUpdated
              ? `Last refreshed ${formatDate(lastUpdated)} · Auto-refresh every 30 seconds`
              : "Waiting for the first history refresh"}
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-base-content">
            <CalendarClock size={16} />
            Total recorded jobs
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {loadingHistory ? "—" : history.length}
          </p>
        </div>

        <div className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-base-content">
            <LoaderCircle size={16} />
            Active jobs
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {loadingHistory ? "—" : activeCount}
          </p>
        </div>

        <div className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-base-content">
            <CheckCircle2 size={16} />
            Completed
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {loadingHistory ? "—" : completedCount}
          </p>
          <p className="mt-1 text-xs text-base-content/50">
            Successfully finished
          </p>
        </div>

        <div className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-base-content">
            <XCircle size={16} />
            Failed
          </div>
          <p className="mt-3 text-3xl font-semibold tabular-nums">
            {loadingHistory ? "—" : failedCount}
          </p>
          <p className="mt-1 text-xs text-base-content/50">
            Terminal failures in this history
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-base-300 bg-base-100 p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Workflow size={19} />
          </span>
          <div>
            <h2 className="font-semibold">Submit a welcome job</h2>
            <p className="mt-1 text-sm leading-6 text-base-content/60">
              Submit through authenticated NestJS to the Go job service. The
              resulting job will appear in your history.
            </p>
          </div>
        </div>

        <form onSubmit={submitJob} className="space-y-4">
          <label htmlFor="job-message" className="block text-sm font-medium">
            Job message
          </label>
          <textarea
            id="job-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={10000}
            rows={5}
            required
            disabled={submitting}
            placeholder="Enter the message for the welcome job..."
            className="w-full resize-y rounded-xl border border-base-300 bg-base-100 px-4 py-3 text-sm outline-none transition placeholder:text-base-content/35 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-base-content/50">
              {message.length.toLocaleString()} / 10,000 characters
            </span>

            <button
              type="submit"
              disabled={submitting || !message.trim()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-content transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Workflow size={16} />
                  Submit job
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {error && (
        <section
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-error/25 bg-error/5 p-4"
        >
          <AlertCircle size={20} className="mt-0.5 shrink-0 text-error" />
          <div>
            <h2 className="font-semibold">Submission unsuccessful</h2>
            <p className="mt-1 text-sm leading-6 text-base-content/70">
              {error}
            </p>
          </div>
        </section>
      )}

      {job && (
        <section
          role="status"
          className="rounded-2xl border border-success/25 bg-success/5 p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              size={22}
              className="mt-0.5 shrink-0 text-success"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Job accepted by the queue</h2>
              <p className="mt-1 text-sm text-base-content/60">
                The API confirmed submission. Check the history below for
                subsequent processing updates.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-base-300 bg-base-100 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                    Job ID
                  </p>
                  <p className="mt-2 break-all font-mono text-sm">{job.id}</p>
                </div>
                <div className="rounded-xl border border-base-300 bg-base-100 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                    Submission status
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={job.status} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-5 py-5 sm:px-7">
          <div>
            <h2 className="text-lg font-semibold">Job history</h2>
            <p className="mt-1 text-sm text-base-content/60">
              Latest 50 jobs for your account. Counts above reflect this fetched history.
            </p>
          </div>
          <span className="rounded-lg bg-base-200 px-3 py-1.5 text-xs font-medium text-base-content/60">
            {filteredJobs.length} of {history.length} shown
          </span>
        </div>

        <div className="grid gap-3 border-b border-base-300 bg-base-200/20 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-7">
          <label className="relative block">
            <span className="sr-only">Search job history</span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ID, type, status, or error..."
              className="min-h-11 w-full rounded-xl border border-base-300 bg-base-100 py-2 pl-10 pr-3 text-sm outline-none transition placeholder:text-base-content/40 focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="relative block">
            <span className="sr-only">Filter jobs by status</span>
            <SlidersHorizontal
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-11 w-full appearance-none rounded-xl border border-base-300 bg-base-100 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              <option value="all">All statuses</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </label>
        </div>

        {historyError && (
          <div
            role="alert"
            className="m-5 flex items-start gap-3 rounded-xl border border-error/25 bg-error/5 p-4 sm:m-7"
          >
            <AlertCircle size={19} className="mt-0.5 shrink-0 text-error" />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-6">{historyError}</p>
              <button
                type="button"
                onClick={() => loadJobHistory(true)}
                className="mt-2 text-sm font-semibold text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {loadingHistory ? (
          <div className="flex items-center justify-center gap-3 px-5 py-16 text-sm text-base-content/60">
            <LoaderCircle size={20} className="animate-spin" />
            Loading your job history...
          </div>
        ) : history.length === 0 && !historyError ? (
          <div className="px-5 py-16 text-center sm:px-7">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-base-200 text-base-content/50">
              <Workflow size={23} />
            </span>
            <h3 className="mt-4 font-semibold">No jobs yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-base-content/60">
              Submit your first welcome job above. Its status and processing
              details will appear here.
            </p>
          </div>
        ) : history.length > 0 && filteredJobs.length === 0 ? (
          <div className="px-5 py-14 text-center sm:px-7">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-base-200 text-base-content/50">
              <Search size={20} />
            </span>
            <h3 className="mt-3 font-semibold">No matching jobs</h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-base-content/60">
              Try another search term or status filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
              className="mt-3 text-sm font-semibold text-primary hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : filteredJobs.length > 0 ? (
          <div className="divide-y divide-base-300">
            {filteredJobs.map((item) => (
              <article
                key={item.id}
                className="space-y-4 px-5 py-5 transition hover:bg-base-200/30 sm:px-7"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-base-content/50">
                      {item.type || "Background job"}
                    </p>
                    <p className="mt-2 break-all font-mono text-sm">
                      {item.id || "Unknown job ID"}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-base-200/60 p-3">
                    <p className="text-xs text-base-content/50">
                      Processing attempts
                    </p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">
                      {Number.isFinite(Number(item.attempt))
                        ? Number(item.attempt) === 0
                          ? "Not started"
                          : item.attempt
                        : "—"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-base-200/60 p-3">
                    <p className="text-xs text-base-content/50">Created</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-base-200/60 p-3">
                    <p className="text-xs text-base-content/50">Last updated</p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDate(item.updatedAt)}
                    </p>
                  </div>
                </div>

                {item.error && (
                  <div className="flex items-start gap-2 rounded-xl border border-error/20 bg-error/5 p-3">
                    <AlertCircle
                      size={16}
                      className="mt-0.5 shrink-0 text-error"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-error">
                        Last reported error
                      </p>
                      <p className="mt-1 break-words text-sm leading-6 text-base-content/75">
                        {item.error}
                      </p>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-base-300 bg-base-200/30 px-5 py-3 sm:px-7">
          <p className="text-xs text-base-content/50">
            History refreshes automatically every 30 seconds and after submission.
          </p>
          <button
            type="button"
            onClick={() => loadJobHistory(true)}
            disabled={refreshing || loadingHistory}
            aria-label="Refresh job history"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-base-300 bg-base-100 transition hover:border-primary/40 disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={refreshing ? "animate-spin" : ""}
            />
          </button>
        </div>
      </section>
    </main>
  );
}
