/** Page component for OperationalWorkspacePage in the Relay web application. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Database,
  Network,
  RefreshCw,
  Search,
  Workflow,
} from "lucide-react";

const EXPRESS_API_URL = (
  import.meta.env.MODE === "development"
    ? "/api"
    : "/api"
).replace(/\/+$/, "");

async function fetchWorkspaceJson(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Your session may have expired. Sign in again.");
    }
    throw new Error(`Could not load records (HTTP ${response.status}).`);
  }

  return response.json();
}

function formatRunDate(value) {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function runStatusClasses(status) {
  switch (String(status || "").toLowerCase()) {
    case "succeeded":
      return "border-success/25 bg-success/10 text-success";
    case "failed":
      return "border-error/25 bg-error/10 text-error";
    case "running":
      return "border-primary/25 bg-primary/10 text-primary";
    default:
      return "border-base-300 bg-base-200 text-base-content/70";
  }
}

function formatRunDuration(value, status) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return status === "running" ? "In progress" : "Unavailable";
  }

  const duration = Math.max(0, Number(value));
  if (duration < 1000) return `${Math.round(duration)} ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)} s`;

  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

const WORKSPACES = {
  agents: {
    eyebrow: "AI OPERATIONS",
    title: "AI Runs",
    description:
      "Monitor authenticated AI answer executions, outcomes, durations, and failure categories.",
    icon: Bot,
    status: "AI execution history",
    capabilities: [
      {
        title: "Execution history",
        description:
          "Browse the latest user-scoped AI answer execution records.",
        category: "Monitoring",
      },
      {
        title: "Run outcomes",
        description:
          "Track running, succeeded, and failed AI answer executions.",
        category: "Monitoring",
      },
      {
        title: "Execution timing",
        description:
          "Review recorded start times, completion durations, and in-progress runs.",
        category: "Performance",
      },
      {
        title: "Failure classification",
        description:
          "Identify timeout, service availability, upstream, and internal error categories.",
        category: "Debugging",
      },
    ],
  },
  jobs: {
    eyebrow: "BACKGROUND OPERATIONS",
    title: "Jobs & Workflows",
    description:
      "Monitor background workloads, queue processing, retries, and job outcomes.",
    icon: Workflow,
    status: "Job records not connected",
    capabilities: [
      {
        title: "Job history",
        description:
          "Browse submitted jobs and their actual lifecycle states.",
        category: "Monitoring",
      },
      {
        title: "Queue visibility",
        description:
          "Inspect queue depth, consumers, and delivery state when a queue-inspection endpoint is available.",
        category: "Queues",
      },
      {
        title: "Retry tracking",
        description:
          "Review retry attempts, delivery failures, and dead-letter events from real records.",
        category: "Reliability",
      },
      {
        title: "Workflow outcomes",
        description:
          "Follow background work from submission through completion or failure.",
        category: "Reliability",
      },
    ],
  },
  analytics: {
    eyebrow: "PLATFORM INSIGHTS",
    title: "Analytics",
    description:
      "Investigate request volume, latency, failures, and platform trends.",
    icon: Activity,
    status: "Analytics data not connected",
    capabilities: [
      {
        title: "Request volume",
        description:
          "Track requests over time using actual metrics from the API layer.",
        category: "Traffic",
      },
      {
        title: "Latency",
        description:
          "Compare response-time percentiles using collected measurements.",
        category: "Performance",
      },
      {
        title: "Error rates",
        description:
          "Identify error trends and service-level failure patterns.",
        category: "Reliability",
      },
      {
        title: "Time-range analysis",
        description:
          "Compare time periods when historical telemetry is available.",
        category: "Performance",
      },
    ],
  },
  knowledge: {
    eyebrow: "KNOWLEDGE SYSTEMS",
    title: "Knowledge & Retrieval",
    description:
      "Ingest tenant-scoped documents, retrieve ranked passages, and generate citation-backed answers from indexed knowledge.",
    icon: Database,
    status: "Tenant-scoped knowledge service",
    capabilities: [
      {
        title: "Knowledge sources",
        description:
          "Ingest documents and inspect indexed source metadata returned by the authenticated knowledge service.",
        category: "Sources",
      },
      {
        title: "Ranked passage retrieval",
        description:
          "Search indexed document chunks and inspect their hybrid retrieval ranking and source metadata.",
        category: "Retrieval",
      },
      {
        title: "Grounded answers",
        description:
          "Generate answers from retrieved evidence and inspect the citations validated by the answer service.",
        category: "Retrieval",
      },
      {
        title: "Index status",
        description:
          "Review document ingestion status and source metadata exposed by the knowledge API.",
        category: "Sources",
      },
    ],
  },
};

const shortcuts = [
  {
    title: "Platform overview",
    description: "Return to the operations dashboard.",
    to: "/",
    icon: Activity,
  },
  {
    title: "Infrastructure",
    description: "Inspect configured service health checks.",
    to: "/infrastructure",
    icon: Network,
  },
  {
    title: "Intelligence",
    description: "Open the intelligence dashboard.",
    to: "/intelligence",
    icon: Bot,
  },
  {
    title: "Messaging workspace",
    description: "Open conversations and messaging.",
    to: "/workspace",
    icon: Workflow,
  },
];

export default function OperationalWorkspacePage({ workspace }) {
  const config = WORKSPACES[workspace];
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [runs, setRuns] = useState([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsRefreshing, setRunsRefreshing] = useState(false);
  const [runsError, setRunsError] = useState("");
  const [runsUpdatedAt, setRunsUpdatedAt] = useState(null);
  const [runSearch, setRunSearch] = useState("");
  const [runStatusFilter, setRunStatusFilter] = useState("all");

  const [knowledgeDocuments, setKnowledgeDocuments] = useState([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(true);
  const [knowledgeError, setKnowledgeError] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeSearching, setKnowledgeSearching] = useState(false);
  const [knowledgeSearchError, setKnowledgeSearchError] = useState("");
  const [knowledgeAnswer, setKnowledgeAnswer] = useState(null);

  const [documentTitle, setDocumentTitle] = useState("");
  const [documentContent, setDocumentContent] = useState("");
  const [documentSource, setDocumentSource] = useState("");
  const [documentSubmitting, setDocumentSubmitting] = useState(false);
  const [documentSubmitError, setDocumentSubmitError] = useState("");
  const [documentSubmitSuccess, setDocumentSubmitSuccess] = useState("");

  const loadKnowledgeDocuments = useCallback(async () => {
    setKnowledgeLoading(true);
    try {
      const payload = await fetchWorkspaceJson(
        `${EXPRESS_API_URL}/ai/documents`,
      );
      if (!Array.isArray(payload?.documents)) {
        throw new Error("Unexpected knowledge document response.");
      }
      setKnowledgeDocuments(payload.documents);
      setKnowledgeError("");
    } catch (error) {
      setKnowledgeError(error.message || "Could not load knowledge documents.");
    } finally {
      setKnowledgeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workspace !== "knowledge") return undefined;
    loadKnowledgeDocuments();
    return undefined;
  }, [workspace, loadKnowledgeDocuments]);

  const submitKnowledgeDocument = async (event) => {
    event.preventDefault();

    const title = documentTitle.trim();
    const content = documentContent.trim();
    const sourceUri = documentSource.trim();

    setDocumentSubmitError("");
    setDocumentSubmitSuccess("");

    if (!title || !content) {
      setDocumentSubmitError("Enter a document title and its content.");
      return;
    }

    if (title.length > 500 || content.length > 1000000 || sourceUri.length > 2048) {
      setDocumentSubmitError("The title, content, or source URL exceeds the allowed length.");
      return;
    }

    if (sourceUri) {
      try {
        const parsedUrl = new URL(sourceUri);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Unsupported URL protocol");
        }
      } catch {
        setDocumentSubmitError("Enter a valid HTTP or HTTPS source URL.");
        return;
      }
    }

    setDocumentSubmitting(true);

    try {
      await fetchWorkspaceJson(`${EXPRESS_API_URL}/ai/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          ...(sourceUri ? { source_uri: sourceUri } : {}),
        }),
      });

      setDocumentTitle("");
      setDocumentContent("");
      setDocumentSource("");
      setDocumentSubmitSuccess("Document ingested successfully. Your knowledge sources have been refreshed.");

      await loadKnowledgeDocuments();
    } catch (error) {
      setDocumentSubmitError(
        error.message || "Could not ingest the document. Please try again.",
      );
    } finally {
      setDocumentSubmitting(false);
    }
  };

  const searchKnowledge = async (event) => {
    event.preventDefault();
    const query = knowledgeQuery.trim();

    if (!query) {
      setKnowledgeSearchError("Enter a question or search phrase.");
      return;
    }

    setKnowledgeSearching(true);
    setKnowledgeSearchError("");
    setKnowledgeAnswer(null);

    try {
      const payload = await fetchWorkspaceJson(
        `${EXPRESS_API_URL}/ai/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: query, top_k: 5 }),
        },
      );

      if (
        typeof payload?.answer !== "string" ||
        !Array.isArray(payload?.citations)
      ) {
        throw new Error("Grounded answer generation returned an unexpected response.");
      }

      setKnowledgeAnswer(payload);
    } catch (error) {
      setKnowledgeAnswer(null);
      setKnowledgeSearchError(
        `Grounded answer generation failed: ${error.message || "Unknown answer error."}`,
      );
    } finally {
      setKnowledgeSearching(false);
    }
  };


  const loadRuns = useCallback(async (manual = false) => {
    if (manual) setRunsRefreshing(true);
    else setRunsLoading(true);

    try {
      const payload = await fetchWorkspaceJson(
        `${EXPRESS_API_URL}/ai/runs?limit=100`,
      );

      if (!Array.isArray(payload?.runs)) {
        throw new Error("The AI service returned an unexpected run-history response.");
      }

      setRuns(payload.runs);
      setRunsError("");
      setRunsUpdatedAt(new Date());
    } catch (error) {
      setRunsError(error.message || "Could not load AI execution history.");
    } finally {
      setRunsLoading(false);
      setRunsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (workspace !== "agents") return undefined;

    loadRuns();
    const intervalId = window.setInterval(() => loadRuns(true), 30000);

    return () => window.clearInterval(intervalId);
  }, [workspace, loadRuns]);

  const runSummary = useMemo(() => ({
    total: runs.length,
    running: runs.filter((run) => run.status === "running").length,
    succeeded: runs.filter((run) => run.status === "succeeded").length,
    failed: runs.filter((run) => run.status === "failed").length,
  }), [runs]);

  const filteredRuns = useMemo(() => {
    const query = runSearch.trim().toLowerCase();

    return runs.filter((run) => {
      const matchesStatus =
        runStatusFilter === "all" || run.status === runStatusFilter;
      const searchableText = [
        run.operation,
        run.status,
        run.errorCategory,
        run._id,
      ].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && (!query || searchableText.includes(query));
    });
  }, [runs, runSearch, runStatusFilter]);

  const categories = useMemo(
    () => ["All", ...new Set(config.capabilities.map((item) => item.category))],
    [config],
  );

  const filteredCapabilities = useMemo(() => {
    const query = search.trim().toLowerCase();

    return config.capabilities.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesSearch =
        !query ||
        `${item.title} ${item.description} ${item.category}`
          .toLowerCase()
          .includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [config, search, category]);

  const Icon = config.icon;

  return (
    <div className="mx-auto max-w-[1440px] space-y-7 px-4 py-7 text-base-content sm:px-6 lg:px-9 lg:py-10">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-base-content">
            {config.eyebrow}
          </p>
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <Icon size={23} />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {config.title}
            </h1>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-base-content/80">
            {config.description}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setRefreshedAt(new Date().toLocaleTimeString());
            setSearch("");
            setCategory("All");
            setRunSearch("");
            setRunStatusFilter("all");
            if (workspace === "agents") loadRuns(true);
            if (workspace === "knowledge") loadKnowledgeDocuments();
          }}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-base-300 bg-base-100 px-4 py-2.5 text-sm font-medium transition hover:border-primary/40 hover:bg-base-200"
        >
          <RefreshCw size={15} />
          Reset view
        </button>
      </header>


      {workspace === "knowledge" && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-base-300/80 bg-base-100 p-5 shadow-sm sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Add to your knowledge base
            </p>
            <h2 className="mt-2 text-xl font-semibold">Ingest a document</h2>
            <p className="mt-1 text-sm text-base-content/65">
              Add text documentation for tenant-scoped retrieval and semantic search.
            </p>

            <form onSubmit={submitKnowledgeDocument} className="mt-5 space-y-4">
              <div>
                <label htmlFor="knowledge-document-title" className="mb-1.5 block text-sm font-medium">
                  Document title
                </label>
                <input
                  id="knowledge-document-title"
                  value={documentTitle}
                  onChange={(event) => setDocumentTitle(event.target.value)}
                  maxLength={500}
                  required
                  placeholder="e.g. Relay Authentication Guide"
                  className="min-h-11 w-full rounded-xl border border-base-300 bg-base-100 px-3 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="knowledge-document-content" className="mb-1.5 block text-sm font-medium">
                  Document content
                </label>
                <textarea
                  id="knowledge-document-content"
                  value={documentContent}
                  onChange={(event) => setDocumentContent(event.target.value)}
                  maxLength={1000000}
                  required
                  rows={7}
                  placeholder="Paste your documentation, policies, technical notes, or other knowledge here…"
                  className="w-full resize-y rounded-xl border border-base-300 bg-base-100 px-3 py-3 text-sm leading-6 outline-none focus:border-primary"
                />
                <p className="mt-1 text-right text-xs text-base-content/50">
                  {documentContent.length.toLocaleString()} / 1,000,000 characters
                </p>
              </div>

              <div>
                <label htmlFor="knowledge-document-source" className="mb-1.5 block text-sm font-medium">
                  Source URL <span className="font-normal text-base-content/50">(optional)</span>
                </label>
                <input
                  id="knowledge-document-source"
                  type="url"
                  value={documentSource}
                  onChange={(event) => setDocumentSource(event.target.value)}
                  maxLength={2048}
                  placeholder="https://docs.example.com/guide"
                  className="min-h-11 w-full rounded-xl border border-base-300 bg-base-100 px-3 text-sm outline-none focus:border-primary"
                />
              </div>

              {documentSubmitError && (
                <p role="alert" className="rounded-xl border border-error/25 bg-error/5 p-3 text-sm text-error">
                  {documentSubmitError}
                </p>
              )}

              {documentSubmitSuccess && (
                <p role="status" className="rounded-xl border border-success/25 bg-success/5 p-3 text-sm">
                  {documentSubmitSuccess}
                </p>
              )}

              <button
                type="submit"
                disabled={documentSubmitting || !documentTitle.trim() || !documentContent.trim()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-content disabled:cursor-not-allowed disabled:opacity-60"
              >
                {documentSubmitting && <RefreshCw size={15} className="animate-spin" />}
                {documentSubmitting ? "Ingesting document…" : "Ingest document"}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-base-300/80 bg-base-100 p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  Connected knowledge service
                </p>
                <h2 className="mt-2 text-xl font-semibold">Knowledge sources</h2>
                <p className="mt-1 text-sm text-base-content/65">
                  Documents returned by your authenticated knowledge API.
                </p>
              </div>
              <button
                type="button"
                onClick={loadKnowledgeDocuments}
                disabled={knowledgeLoading}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-base-300 px-3 py-2 text-xs font-semibold hover:bg-base-200 disabled:opacity-60"
              >
                <RefreshCw size={14} className={knowledgeLoading ? "animate-spin" : ""} />
                Refresh documents
              </button>
            </div>

            {knowledgeError && (
              <div role="alert" className="mt-4 rounded-xl border border-error/25 bg-error/5 p-4 text-sm">
                {knowledgeError}
                <button type="button" onClick={loadKnowledgeDocuments} className="ml-2 font-semibold underline">
                  Try again
                </button>
              </div>
            )}

            {knowledgeLoading && (
              <div className="mt-5 flex items-center gap-3 rounded-xl bg-base-200/60 p-5 text-sm text-base-content/65">
                <RefreshCw size={17} className="animate-spin" />
                Loading documents…
              </div>
            )}

            {!knowledgeLoading && !knowledgeError && knowledgeDocuments.length === 0 && (
              <div className="mt-5 rounded-xl border border-dashed border-base-300 px-5 py-9 text-center">
                <Database size={24} className="mx-auto text-base-content/40" />
                <p className="mt-3 text-sm font-semibold">No knowledge documents found</p>
                <p className="mt-1 text-xs leading-5 text-base-content/60">
                  Ingest a document through the existing AI document endpoint to make it available here.
                </p>
              </div>
            )}

            {!knowledgeLoading && knowledgeDocuments.length > 0 && (
              <div className="mt-5 space-y-3">
                {knowledgeDocuments.map((doc) => (
                  <article key={doc.id} className="rounded-xl border border-base-300/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold">{doc.title || "Untitled document"}</h3>
                        {doc.source_uri && (
                          /^https?:\/\//i.test(doc.source_uri) ? (
                            <a
                              href={doc.source_uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block break-all text-xs text-primary hover:underline"
                            >
                              Open original source ↗
                            </a>
                          ) : (
                            <p className="mt-1 break-all text-xs text-base-content/60">
                              {doc.source_uri}
                            </p>
                          )
                        )}
                        {doc.created_at && (
                          <p className="mt-2 text-[11px] text-base-content/50">
                            Added {formatRunDate(doc.created_at)}
                          </p>
                        )}
                      </div>
                      <span className="rounded-md border border-base-300 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
                        {doc.status || "available"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-base-300/80 bg-base-100 p-5 shadow-sm sm:p-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Semantic retrieval
            </p>
            <h2 className="mt-2 text-xl font-semibold">Search indexed knowledge</h2>
            <p className="mt-1 text-sm text-base-content/65">
              Retrieve ranked document passages and generate a separate answer grounded in their indexed evidence.
            </p>

            <form onSubmit={searchKnowledge} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3">
                <Search size={16} className="shrink-0 text-base-content/50" />
                <input
                  value={knowledgeQuery}
                  onChange={(event) => setKnowledgeQuery(event.target.value)}
                  maxLength={2000}
                  placeholder="Ask a question or search your documents…"
                  aria-label="Search indexed knowledge"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={knowledgeSearching || !knowledgeQuery.trim()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-content disabled:cursor-not-allowed disabled:opacity-60"
              >
                {knowledgeSearching && <RefreshCw size={14} className="animate-spin" />}
                {knowledgeSearching ? "Searching…" : "Search knowledge"}
              </button>
            </form>

            {knowledgeSearchError && (
              <p role="alert" className="mt-3 text-sm text-error">{knowledgeSearchError}</p>
            )}

            {knowledgeAnswer && (
              <section
                aria-live="polite"
                className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Search size={16} />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">Grounded answer</h3>
                    <p className="text-xs text-base-content/60">
                      Generated from your indexed knowledge
                    </p>
                  </div>
                </div>

                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-base-content">
                  {knowledgeAnswer.answer.trim() ||
                    "The answer service returned no answer."}
                </p>

                {Array.isArray(knowledgeAnswer.uploaded_by) &&
                  knowledgeAnswer.uploaded_by.length > 0 && (
                    <p className="mt-3 text-xs text-base-content/60">
                      Uploaded by {knowledgeAnswer.uploaded_by.join(", ")}
                    </p>
                  )}


              </section>
            )}


          </div>
        </section>
      )}

      {workspace === "agents" && (
        <section className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: "Total runs", value: runSummary.total, detail: "Latest records", icon: Bot, tone: "text-primary" },
              { label: "Running", value: runSummary.running, detail: "Currently in progress", icon: RefreshCw, tone: "text-primary" },
              { label: "Succeeded", value: runSummary.succeeded, detail: "Completed successfully", icon: CheckCircle2, tone: "text-success" },
              { label: "Failed", value: runSummary.failed, detail: "Require investigation", icon: CircleHelp, tone: "text-error" },
            ].map((metric) => {
              const MetricIcon = metric.icon;
              return (
                <article key={metric.label} className="rounded-2xl border border-base-300/80 bg-base-100 p-4 shadow-sm sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-base-content/60">{metric.label}</p>
                    <MetricIcon size={17} className={metric.tone} />
                  </div>
                  <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{metric.value.toLocaleString()}</p>
                  <p className="mt-1 text-[11px] text-base-content/50">{metric.detail}</p>
                </article>
              );
            })}
          </div>

          <section className="rounded-2xl border border-base-300/80 bg-base-100 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Live execution history
              </p>
              <h2 className="mt-2 text-xl font-semibold">Recent AI runs</h2>
              <p className="mt-1 text-xs text-base-content/60">
                Authenticated records returned by the AI execution API.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadRuns(true)}
              disabled={runsRefreshing}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-base-300 px-3 py-2 text-xs font-semibold transition hover:bg-base-200 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw
                size={14}
                className={runsRefreshing ? "animate-spin" : ""}
              />
              {runsRefreshing ? "Refreshing…" : "Refresh runs"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-base-content/50">
              {runsUpdatedAt
                ? `Last updated ${formatRunDate(runsUpdatedAt)}`
                : "Waiting for the first successful refresh"}
              <span className="mx-2">·</span>
              Auto-refresh every 30 seconds
            </p>
            <p className="text-[11px] text-base-content/50">
              {runs.length.toLocaleString()} of up to 100 recent records
            </p>
          </div>

          {runsError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-error/25 bg-error/5 px-4 py-3 text-sm text-base-content/80"
            >
              {runsError}
              <button
                type="button"
                onClick={() => loadRuns(true)}
                className="ml-2 font-semibold text-error underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          )}

          {runsLoading && (
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-base-200/60 p-5 text-sm text-base-content/65">
              <RefreshCw size={17} className="animate-spin" />
              Loading execution history…
            </div>
          )}

          {!runsLoading && !runsError && runs.length === 0 && (
            <div className="mt-5 rounded-xl border border-dashed border-base-300 px-5 py-10 text-center">
              <Bot size={24} className="mx-auto text-base-content/40" />
              <p className="mt-3 text-sm font-semibold">No AI runs yet</p>
              <p className="mt-1 text-xs leading-5 text-base-content/60">
                When you submit a supported AI request, its execution record will appear here.
              </p>
            </div>
          )}

          {!runsLoading && runs.length > 0 && (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3">
                  <Search size={16} className="shrink-0 text-base-content/45" />
                  <input
                    value={runSearch}
                    onChange={(event) => setRunSearch(event.target.value)}
                    placeholder="Search operation, error, or run ID…"
                    aria-label="Search AI runs"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/40"
                  />
                  {runSearch && (
                    <button type="button" onClick={() => setRunSearch("")} className="text-xs font-semibold text-primary">
                      Clear
                    </button>
                  )}
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-base-300 px-3">
                  <span className="shrink-0 text-xs text-base-content/55">Status</span>
                  <select
                    value={runStatusFilter}
                    onChange={(event) => setRunStatusFilter(event.target.value)}
                    aria-label="Filter AI runs by status"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  >
                    <option value="all">All statuses</option>
                    <option value="running">Running</option>
                    <option value="succeeded">Succeeded</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/55">
                <span>
                  Showing {filteredRuns.length.toLocaleString()} of {runs.length.toLocaleString()} runs
                </span>
                {(runSearch || runStatusFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setRunSearch("");
                      setRunStatusFilter("all");
                    }}
                    className="font-semibold text-primary hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {filteredRuns.length === 0 ? (
                <div className="rounded-xl border border-dashed border-base-300 px-5 py-9 text-center">
                  <Search size={22} className="mx-auto text-base-content/40" />
                  <p className="mt-3 text-sm font-semibold">No matching AI runs</p>
                  <p className="mt-1 text-xs text-base-content/60">
                    Try another search term or clear the selected status filter.
                  </p>
                </div>
              ) : (
              <div className="space-y-3">
              {filteredRuns.map((run, index) => (
                <article
                  key={run._id || `${run.startedAt || run.createdAt}-${index}`}
                  className="rounded-xl border border-base-300/80 p-4 transition hover:border-primary/30"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">
                          {String(run.operation || "AI execution")
                            .replace(/[_-]+/g, " ")
                            .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                        </h3>
                        <span
                          className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${runStatusClasses(run.status)}`}
                        >
                          {run.status || "unknown"}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-base-content/60">
                        Started {formatRunDate(run.startedAt || run.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-base-content/65">
                      <span>
                        Duration:{" "}
                        <strong className="font-semibold text-base-content">
                          {formatRunDuration(run.durationMs, run.status)}
                        </strong>
                      </span>
                      {run.errorCategory && (
                        <span>
                          Error:{" "}
                          <strong className="font-semibold text-error">
                            {String(run.errorCategory).replace(/_/g, " ")}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              </div>
              )}
            </>
          )}
          </section>
        </section>
      )}

      {workspace !== "agents" && workspace !== "knowledge" && (
      <section className="rounded-2xl border border-warning/25 bg-warning/5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning">
            <CircleHelp size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{config.status}</h2>
            <p className="mt-1 text-sm leading-6 text-base-content/80">
              This page is interactive, but operational records are not displayed
              until a real data endpoint is connected. No sample records or
              fabricated metrics are being presented as live data.
            </p>
            {refreshedAt && (
              <p className="mt-2 text-xs text-base-content/80">
                View reset at {refreshedAt}. This action does not query the backend.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/infrastructure"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-content transition hover:brightness-110"
              >
                Inspect infrastructure <ArrowRight size={14} />
              </Link>
              <button
                type="button"
                onClick={() => setShowDetails((value) => !value)}
                aria-expanded={showDetails}
                className="inline-flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 px-3.5 py-2.5 text-xs font-semibold transition hover:bg-base-200"
              >
                {showDetails ? "Hide integration details" : "Integration details"}
              </button>
            </div>

            {showDetails && (
              <div className="mt-4 rounded-xl border border-base-300 bg-base-100 p-4">
                <p className="text-sm font-semibold">What is needed</p>
                <p className="mt-2 text-xs leading-5 text-base-content/60">
                  A documented, authenticated API endpoint for this workspace,
                  a defined response schema, and loading, empty, and error
                  handling. The frontend can then display verified records.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      <section className="rounded-2xl border border-base-300/80 bg-base-100 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Explore capabilities
            </p>
            <h2 className="mt-2 text-xl font-semibold">Workspace tools</h2>
            <p className="mt-1 text-xs text-base-content/55">
              Search and filter available capabilities.
            </p>
          </div>
          <span className="text-xs text-base-content/80">
            {filteredCapabilities.length} of {config.capabilities.length} capabilities
          </span>
        </div>

        <label className="mt-5 flex h-11 items-center gap-2 rounded-xl border border-base-300 bg-base-200/40 px-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
          <Search size={16} className="shrink-0 text-base-content/80" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${config.title.toLowerCase()} capabilities...`}
            aria-label={`Search ${config.title} capabilities`}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-base-content/80"
          />
        </label>

        <div role="group" aria-label="Filter capabilities by category" className="mt-4 flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                category === item
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-base-300 text-base-content/60 hover:bg-base-200"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {filteredCapabilities.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-base-300/80 bg-base-100 p-4 transition hover:border-primary/30"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-base-200 text-base-content/60">
                  <CheckCircle2 size={17} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{item.title}</h3>
                    <span className="rounded-md bg-base-200 px-2 py-1 text-[10px] text-base-content/50">
                      {item.category}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-base-content/55">
                    {item.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {filteredCapabilities.length === 0 && (
          <div className="py-10 text-center">
            <Search size={22} className="mx-auto text-base-content/35" />
            <p className="mt-3 text-sm font-medium">No matching capabilities</p>
            <p className="mt-1 text-xs text-base-content/50">
              Try a different search or select another category.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategory("All");
              }}
              className="mt-4 rounded-lg border border-base-300 px-3 py-2 text-xs font-semibold hover:bg-base-200"
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Navigation
          </p>
          <h2 className="mt-2 text-xl font-semibold">Continue working</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shortcuts.map((item) => {
            const ShortcutIcon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                className="group rounded-xl border border-base-300/80 bg-base-100 p-4 transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <ShortcutIcon size={17} />
                  </span>
                  <ArrowRight
                    size={15}
                    className="text-base-content/35 transition group-hover:translate-x-1 group-hover:text-primary"
                  />
                </div>
                <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
                <p className="mt-1 text-xs leading-5 text-base-content/55">
                  {item.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <p className="flex items-center gap-2 border-t border-base-300/70 pt-4 text-xs text-base-content/80">
        <Clock3 size={13} />
        {workspace === "agents"
          ? "Execution history refreshes automatically every 30 seconds."
          : workspace === "knowledge"
            ? "Documents and retrieval results come from the authenticated knowledge service."
            : "Operational records appear when their API integration is available."}
      </p>
    </div>
  );
}
