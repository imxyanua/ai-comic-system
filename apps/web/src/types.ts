export type Comic = {
  id: string;
  title: string;
  description: string | null;
  style_guide: string | null;
  status: "draft" | "active" | "archived";
};

export type Story = {
  id: string;
  title: string;
  synopsis: string | null;
  content: string | null;
};

export type Character = {
  id: string;
  name: string;
  description: string;
  reference_asset_id: string | null;
};

export type Scene = {
  id: string;
  sort_order: number;
  title: string | null;
  summary: string | null;
};

export type DialogLine = { speaker: string; text: string };

export type PanelStatus = "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Panel = {
  id: string;
  scene_id: string;
  sort_order: number;
  image_prompt: string | null;
  negative_prompt: string | null;
  image_asset_id: string | null;
  generation_status: PanelStatus;
  dialog: DialogLine[];
};

export type JobStatus = "pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Job = {
  job_id: string;
  panel_id: string;
  status: JobStatus;
  error_code: string | null;
  error_message: string | null;
  result_asset_id: string;
  attempt: number;
};

export type Workflow = {
  workflow_id: string;
  status: "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  pending: number;
};

export type Asset = { asset_id: string; status: "pending" | "ready"; download_url: string | null };

export const ACTIVE_PANEL_STATUSES: PanelStatus[] = ["queued", "running"];

export const panelStatusLabel: Record<PanelStatus, string> = {
  idle: "Chưa sinh",
  queued: "Đang chờ worker",
  running: "Đang vẽ",
  succeeded: "Xong",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};

export const workflowStatusLabel: Record<Workflow["status"], string> = {
  running: "Đang chạy",
  completed: "Xong",
  completed_with_errors: "Xong, có panel lỗi",
  failed: "Lỗi",
  cancelled: "Đã hủy",
};
