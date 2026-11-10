/**
 * Pure health-summary helpers for the operations overview.
 */

export function countCompletedHealthChecks(statuses, healthIds) {
  return healthIds.filter((id) => {
    const status = statuses[id]?.status;
    return Boolean(status) && status !== "checking";
  }).length;
}

export function getPlatformHealthSummary(statuses) {
  const values = Object.values(statuses);
  const total = values.length;
  const online = values.filter((status) => status === "online").length;
  const hasUnavailable = values.includes("unavailable");
  const hasPending = values.some(
    (status) => !status || status === "checking",
  );

  if (total > 0 && online === total) {
    return {
      label: "Everything is up and running",
      detail: `All ${total} platform service checks passed.`,
      tone: "success",
    };
  }

  if (hasUnavailable) {
    return {
      label: "Some services need attention",
      detail: `${online} of ${total} platform service checks passed. Inspect the service details below.`,
      tone: "warning",
    };
  }

  if (!hasPending) {
    return {
      label: "Health partially verified",
      detail: "All checks completed, but at least one service could not be verified from the browser.",
      tone: "pending",
    };
  }

  return {
    label: "Checking platform health",
    detail: "Some checks are still in progress.",
    tone: "pending",
  };
}
