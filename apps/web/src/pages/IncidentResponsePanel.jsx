/** UI component for IncidentResponsePanel in the Relay web application. */

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { axiosInstance } from "../lib/axios";

const formatStatus = (status) =>
  String(status || "unknown").replaceAll("_", " ");

function StatusPill({ status }) {
  const tone =
    status === "resolved_simulated"
      ? "border-success/30 bg-success/10 text-success"
      : status === "approved"
        ? "border-warning/30 bg-warning/10 text-warning"
        : status === "execution_failed" || status === "verification_failed"
          ? "border-error/30 bg-error/10 text-error"
          : "border-base-content/15 bg-base-200 text-base-content/65";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {formatStatus(status)}
    </span>
  );
}

function PanelButton({ children, onClick, disabled, secondary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        secondary
          ? "border border-base-content/15 bg-base-100/50 hover:border-primary/40"
          : "bg-primary text-primary-content hover:brightness-110"
      }`}
    >
      {children}
    </button>
  );
}

export default function IncidentResponsePanel() {
  const [incidents, setIncidents] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = incidents.find((item) => item.id === selectedId) || null;

  const loadIncidents = useCallback(async ({ silent = false } = {}) => {
    try {
      const response = await axiosInstance.get("/incidents");
      const items = Array.isArray(response.data) ? response.data : [];
      setIncidents(items);
      setSelectedId((current) =>
        items.some((item) => item.id === current)
          ? current
          : items[0]?.id || "",
      );
      if (!silent) setError("");
    } catch (requestError) {
      if (!silent) {
        setError(
          requestError.response?.data?.message ||
            (requestError.response?.status === 401
              ? "Sign in to access your incident workspace."
              : "Unable to load incidents. Check the Express and Python AI services."),
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    if (busy) return undefined;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        loadIncidents({ silent: true });
      }
    };

    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [busy, loadIncidents]);

  const updateIncident = (updated) => {
    setIncidents((current) => {
      const exists = current.some((item) => item.id === updated.id);
      return exists
        ? current.map((item) => (item.id === updated.id ? updated : item))
        : [updated, ...current];
    });
    setSelectedId(updated.id);
  };

  const runAction = async (action) => {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await action();
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          "The incident request failed. Refresh and check the service logs.",
      );
    } finally {
      setBusy(false);
    }
  };

  const createIncident = () =>
    runAction(async () => {
      const response = await axiosInstance.post("/incidents", {
        scenario_id: "api-latency-spike-v1",
      });
      updateIncident(response.data);
      setNotice("Incident created. Evidence is recorded; run an investigation to evaluate the hypotheses.");
    });

  const investigate = () =>
    selected &&
    runAction(async () => {
      const response = await axiosInstance.post(
        `/incidents/${encodeURIComponent(selected.id)}/investigate`,
        {},
      );
      updateIncident(response.data);
      setNotice("Investigation completed. Review the evidence and proposed action before approving.");
    });

  const approve = () =>
    selected &&
    runAction(async () => {
      await axiosInstance.post(
        `/incidents/${encodeURIComponent(selected.id)}/approve`,
        {},
      );
      updateIncident({ ...selected, status: "approved" });
      setNotice("Approval recorded. Execution remains a separate, explicit step.");
    });

  const execute = () =>
    selected &&
    runAction(async () => {
      const response = await axiosInstance.post(
        `/incidents/${encodeURIComponent(selected.id)}/execute`,
        {},
      );
      updateIncident(response.data);
      setNotice("Simulation finished. Review the verification result and audit history.");
    });

  const recoverExecution = () =>
    selected &&
    runAction(async () => {
      const response = await axiosInstance.post(
        `/incidents/${encodeURIComponent(selected.id)}/recover`,
        {},
      );
      updateIncident(response.data);
      setNotice(
        "Execution marked interrupted. No action was replayed; review the incident before taking further action.",
      );
    });

  const investigation = selected?.investigation;
  const evidence = Array.isArray(investigation?.evidence)
    ? investigation.evidence
    : [];
  const hypotheses = Array.isArray(investigation?.hypotheses)
    ? investigation.hypotheses
    : [];
  const leading = investigation?.leading_hypothesis;
  const action = selected?.action;
  const result = selected?.result;
  const trace = Array.isArray(investigation?.trace) ? investigation.trace : [];
  const traceByStage = new Map(trace.map((record) => [record.stage, record]));
  const runId = trace.find((record) => record.run_id)?.run_id;
  const agentStages = [
    {
      id: "prepare_context",
      name: "Context Preparation",
      description: "Prepare incident context and supporting signals.",
    },
    {
      id: "evidence_agent",
      name: "Evidence Agent",
      description: "Evaluate the available incident evidence.",
    },
    {
      id: "diagnosis_agent",
      name: "Diagnosis Agent",
      description: "Develop and rank possible root causes.",
    },
    {
      id: "verification_agent",
      name: "Verification Agent",
      description: "Validate the diagnosis against the evidence.",
    },
    {
      id: "supervisor",
      name: "Supervisor Agent",
      description: "Consolidate findings into the investigation report.",
    },
  ];

  const agentStatusCounts = agentStages.reduce(
    (counts, stage) => {
      const status = traceByStage.get(stage.id)?.status || "pending";
      if (status === "running") counts.active += 1;
      if (status === "completed") counts.completed += 1;
      if (status === "failed") counts.failed += 1;
      return counts;
    },
    { active: 0, completed: 0, failed: 0 },
  );

  return (
    <section className="relay-panel overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-4 border-b border-base-content/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Activity size={20} />
          </span>
          <div>
            <p className="relay-eyebrow mb-1">Incident intelligence</p>
            <h2 className="text-lg font-semibold tracking-tight">Investigate and respond</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-base-content/55">
              Evidence-backed investigation with explicit approval and simulated remediation.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PanelButton secondary disabled={busy || loading} onClick={loadIncidents}>
            <RefreshCw size={14} /> Refresh
          </PanelButton>
          <PanelButton disabled={busy} onClick={createIncident}>
            <Plus size={15} /> New incident
          </PanelButton>
        </div>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="border-b border-base-content/10 p-4 lg:border-b-0 lg:border-r">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-base-content/45">
            Your incidents ({incidents.length})
          </p>
          {loading ? (
            <p className="flex items-center gap-2 py-4 text-xs text-base-content/50">
              <LoaderCircle size={15} className="animate-spin" /> Loading incidents…
            </p>
          ) : incidents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-base-content/15 p-4">
              <p className="text-sm font-medium">No incidents yet</p>
              <p className="mt-1 text-xs leading-5 text-base-content/50">
                Create a sample latency incident to begin.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {incidents.map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(incident.id);
                    setError("");
                    setNotice("");
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    incident.id === selectedId
                      ? "border-primary/40 bg-primary/5"
                      : "border-base-content/10 bg-base-100/30 hover:border-primary/25"
                  }`}
                >
                  <span className="block text-sm font-semibold leading-5">
                    {incident.title}
                  </span>
                  <span className="mt-2 block text-[11px] text-base-content/45">
                    {incident.service}
                  </span>
                  <span className="mt-3 block">
                    <StatusPill status={incident.status} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-5 p-5 sm:p-6">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-error/25 bg-error/5 p-3 text-xs leading-5 text-error">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-success/25 bg-success/5 p-3 text-xs leading-5 text-base-content/80">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
              <span>{notice}</span>
            </div>
          )}

          {!selected ? (
            <div className="grid min-h-52 place-items-center text-center">
              <div>
                <ShieldCheck size={28} className="mx-auto text-base-content/30" />
                <p className="mt-3 text-sm font-semibold">Incident workspace ready</p>
                <p className="mt-1 text-xs text-base-content/50">
                  Create an incident to begin an investigation.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-base-content/45">
                    {selected.service}
                  </p>
                  <h3 className="mt-1 text-base font-semibold">{selected.title}</h3>
                  <p className="mt-1 break-all font-mono text-[10px] text-base-content/35">
                    {selected.id}
                  </p>
                </div>
                <StatusPill status={selected.status} />
              </div>

              <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <ShieldCheck size={15} className="text-warning" />
                  Controlled execution mode
                </p>
                <p className="mt-1 text-xs leading-5 text-base-content/60">
                  This scenario uses deterministic sample evidence and a simulator-only remediation. It does not query live production telemetry or change real infrastructure.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {["detected", "investigated"].includes(selected.status) && (
                  <PanelButton disabled={busy} onClick={investigate}>
                    <Activity size={14} /> {selected.status === "investigated" ? "Re-investigate" : "Investigate"}
                  </PanelButton>
                )}
                {selected.status === "investigated" && (
                  <PanelButton disabled={busy} onClick={approve}>
                    <ClipboardCheck size={14} /> Approve proposed action
                  </PanelButton>
                )}
                {selected.status === "approved" && (
                  <PanelButton disabled={busy} onClick={execute}>
                    <Play size={14} /> Execute simulation
                  </PanelButton>
                )}
                {selected.status === "executing" && (
                  <PanelButton
                    secondary
                    disabled={busy}
                    onClick={recoverExecution}
                  >
                    <ShieldCheck size={14} /> Recover interrupted execution
                  </PanelButton>
                )}
                {busy && (
                  <span className="inline-flex items-center gap-2 px-2 text-xs text-base-content/50">
                    <LoaderCircle size={14} className="animate-spin" /> Processing…
                  </span>
                )}
              </div>

              <section
                aria-labelledby="agent-workflow-heading"
                className="rounded-2xl border border-base-content/10 bg-base-100/30 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">
                      Multi-agent orchestration
                    </p>
                    <h4 id="agent-workflow-heading" className="mt-1 text-sm font-semibold">
                      Investigation workflow
                    </h4>
                    <p className="mt-1 text-xs leading-5 text-base-content/50">
                      Five ordered stages working together to investigate this incident.
                    </p>
                  </div>
                  <span className="rounded-full border border-base-content/10 px-2.5 py-1 text-[10px] font-semibold text-base-content/60">
                    {trace.length}/{agentStages.length} stages recorded
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-xl border border-base-content/10 bg-base-100/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/45">Total agents</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{agentStages.length}</p>
                    <p className="mt-1 text-[10px] text-base-content/45">Configured workflow stages</p>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/45">Active</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{agentStatusCounts.active}</p>
                    <p className="mt-1 text-[10px] text-base-content/45">Currently running</p>
                  </div>
                  <div className="rounded-xl border border-success/20 bg-success/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/45">Completed</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{agentStatusCounts.completed}</p>
                    <p className="mt-1 text-[10px] text-base-content/45">Stages finished</p>
                  </div>
                  <div className="rounded-xl border border-error/20 bg-error/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-base-content/45">Failed</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{agentStatusCounts.failed}</p>
                    <p className="mt-1 text-[10px] text-base-content/45">Stages with errors</p>
                  </div>
                </div>

                {runId && (
                  <div className="mt-4 rounded-lg bg-base-200/60 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-base-content/45">
                      Investigation run ID
                    </p>
                    <p className="mt-1 break-all font-mono text-[10px] text-base-content/65">
                      {runId}
                    </p>
                  </div>
                )}

                <ol className="mt-4 space-y-3">
                  {agentStages.map((stage, index) => {
                    const record = traceByStage.get(stage.id);
                    const status = record?.status || "pending";
                    const statusTone =
                      status === "completed"
                        ? "border-success/25 bg-success/10 text-success"
                        : status === "failed"
                          ? "border-error/25 bg-error/10 text-error"
                          : status === "running"
                            ? "border-primary/25 bg-primary/10 text-primary"
                            : "border-base-content/10 bg-base-200/60 text-base-content/45";

                    return (
                      <li
                        key={stage.id}
                        className="flex items-start gap-3 rounded-xl border border-base-content/10 p-3"
                      >
                        <span className={`grid size-8 shrink-0 place-items-center rounded-lg border text-xs font-bold ${statusTone}`}>
                          {status === "completed" ? (
                            <CheckCircle2 size={16} />
                          ) : status === "failed" ? (
                            <AlertTriangle size={16} />
                          ) : (
                            index + 1
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold">{stage.name}</p>
                              <p className="mt-1 font-mono text-[10px] text-base-content/45">{stage.id}</p>
                            </div>
                            <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${statusTone}`}>
                              {formatStatus(status)}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-base-content/50">
                            {stage.description}
                          </p>
                          {record && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-base-content/55">
                              <span>
                                Duration: {typeof record.duration_ms === "number"
                                  ? `${record.duration_ms.toFixed(2)} ms`
                                  : "Unavailable"}
                              </span>
                              {record.error_type && (
                                <span className="font-medium text-error">
                                  Error: {record.error_type}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {trace.length === 0 && (
                  <p className="mt-3 rounded-lg border border-dashed border-base-content/15 p-3 text-xs leading-5 text-base-content/55">
                    No execution trace is stored for this incident yet. Run an investigation to populate the workflow with recorded stage results.
                  </p>
                )}
              </section>

              {leading && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                    Leading hypothesis
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {String(leading.id || "Unspecified").replaceAll("_", " ")}
                  </p>
                  {typeof leading.confidence === "number" && (
                    <p className="mt-1 text-xs text-base-content/55">
                      Scenario confidence score: {(leading.confidence * 100).toFixed(0)}%
                      {" · "}not a calibrated probability
                    </p>
                  )}
                  {leading.evidence_ids?.length > 0 && (
                    <p className="mt-2 text-xs leading-5 text-base-content/60">
                      Supporting evidence: {leading.evidence_ids.join(", ")}
                    </p>
                  )}
                </div>
              )}

              {hypotheses.length > 0 && (
                <div>
                  <h4 className="mb-3 text-sm font-semibold">Ranked hypotheses</h4>
                  <div className="space-y-2">
                    {hypotheses.map((hypothesis) => (
                      <div key={hypothesis.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-content/10 p-3">
                        <div>
                          <p className="text-xs font-semibold">
                            {String(hypothesis.id).replaceAll("_", " ")}
                          </p>
                          <p className="mt-1 text-[11px] text-base-content/45">
                            Evidence: {(hypothesis.evidence_ids || []).join(", ") || "None listed"}
                          </p>
                        </div>
                        <span className="font-mono text-xs text-base-content/65">
                          {typeof hypothesis.confidence === "number"
                            ? `${(hypothesis.confidence * 100).toFixed(0)}%`
                            : "Unscored"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-3 text-sm font-semibold">
                  Evidence ({evidence.length})
                </h4>
                {evidence.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-base-content/15 p-4 text-xs text-base-content/50">
                    Run an investigation to review the scenario evidence.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {evidence.map((item) => (
                      <div key={item.id} className="rounded-xl border border-base-content/10 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-primary">{item.id}</span>
                          <span className="rounded bg-base-200 px-2 py-0.5 text-[9px] uppercase tracking-wide text-base-content/55">
                            {item.type || "evidence"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5">{item.observation}</p>
                        {item.source && (
                          <p className="mt-1 text-[10px] text-base-content/45">
                            Source: {item.source}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {action && (
                <div className="rounded-xl border border-base-content/10 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-base-content/45">
                    Proposed remediation
                  </p>
                  <p className="mt-2 text-sm font-semibold">{action.description}</p>
                  <p className="mt-1 text-xs text-base-content/55">
                    Action: {action.action_id} · Risk: {action.risk}
                  </p>
                </div>
              )}

              {result && (
                <div className="rounded-xl border border-success/25 bg-success/5 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 size={17} className="text-success" />
                    Simulation verification
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-base-100/60 p-3">
                      <p className="text-[10px] text-base-content/45">Before</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">
                        {result.before_ms} <span className="text-xs font-normal">ms</span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-base-100/60 p-3">
                      <p className="text-[10px] text-base-content/45">After</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums">
                        {result.after_ms} <span className="text-xs font-normal">ms</span>
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-base-content/65">
                    Verification: {result.passed ? "passed" : "failed"} · Environment: {result.environment || "simulator"}.
                    {" "}This is a simulated result, not a live service measurement.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
