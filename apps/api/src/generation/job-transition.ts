export type JobStatus = "pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type PanelStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type CallbackStatus = "running" | "succeeded" | "failed";

export type CallbackEffect =
  | { type: "noop" }
  | { type: "conflict" }
  | {
      type: "change";
      jobStatus: JobStatus;
      panelStatus: PanelStatus;
      markAssetReady: boolean;
      attachImage: boolean;
    };

const TERMINAL = new Set<JobStatus>(["succeeded", "failed", "cancelled"]);

export function applyJobCallback(current: JobStatus, incoming: CallbackStatus): CallbackEffect {
  if (current === incoming) {
    return { type: "noop" };
  }
  if (TERMINAL.has(current)) {
    return { type: "conflict" };
  }
  if (incoming === "running" && (current === "pending" || current === "queued")) {
    return {
      type: "change",
      jobStatus: "running",
      panelStatus: "running",
      markAssetReady: false,
      attachImage: false,
    };
  }
  if (incoming === "succeeded" && (current === "pending" || current === "queued" || current === "running")) {
    return {
      type: "change",
      jobStatus: "succeeded",
      panelStatus: "succeeded",
      markAssetReady: true,
      attachImage: true,
    };
  }
  if (incoming === "failed" && (current === "pending" || current === "queued" || current === "running")) {
    return {
      type: "change",
      jobStatus: "failed",
      panelStatus: "failed",
      markAssetReady: false,
      attachImage: false,
    };
  }
  return { type: "conflict" };
}
