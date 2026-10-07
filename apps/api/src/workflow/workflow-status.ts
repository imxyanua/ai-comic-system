export type WorkflowStatus = "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";
export type JobStatus = "pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type WorkflowJob = { panelId: string; status: JobStatus; createdAt: Date };

export type WorkflowCounts = {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  pending: number;
};

export function latestJobPerPanel<T extends WorkflowJob>(jobs: T[]): T[] {
  const latest = new Map<string, T>();
  for (const job of jobs) {
    const current = latest.get(job.panelId);
    if (!current || job.createdAt > current.createdAt) {
      latest.set(job.panelId, job);
    }
  }
  return [...latest.values()];
}

/** Panels listed in the workflow that have no job yet count as pending, so the batch cannot finish early. */
export function countJobs(jobs: WorkflowJob[], expectedPanelIds: string[] = []): WorkflowCounts {
  const latest = latestJobPerPanel(jobs);
  const counts: WorkflowCounts = { total: latest.length, succeeded: 0, failed: 0, cancelled: 0, pending: 0 };
  for (const job of latest) {
    if (job.status === "succeeded") {
      counts.succeeded += 1;
    } else if (job.status === "failed") {
      counts.failed += 1;
    } else if (job.status === "cancelled") {
      counts.cancelled += 1;
    } else {
      counts.pending += 1;
    }
  }
  const withJob = new Set(latest.map((job) => job.panelId));
  for (const panelId of new Set(expectedPanelIds)) {
    if (!withJob.has(panelId)) {
      counts.total += 1;
      counts.pending += 1;
    }
  }
  return counts;
}

export function nextWorkflowStatus(
  current: WorkflowStatus,
  jobs: WorkflowJob[],
  expectedPanelIds: string[] = [],
): WorkflowStatus {
  if (current === "cancelled") {
    return "cancelled";
  }
  const counts = countJobs(jobs, expectedPanelIds);
  if (counts.pending > 0) {
    return "running";
  }
  if (counts.total > 0 && counts.succeeded === counts.total) {
    return "completed";
  }
  if (counts.succeeded > 0) {
    return "completed_with_errors";
  }
  return "failed";
}

export function panelIdsFromContext(context: unknown): string[] {
  if (typeof context !== "object" || context === null || !("panel_ids" in context)) {
    return [];
  }
  const ids = (context as { panel_ids: unknown }).panel_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}
