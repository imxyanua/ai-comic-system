import { celeryMessage, PANEL_TASK_NAME, TASK_SCHEMA_VERSION } from "./celery-publisher";

describe("celeryMessage", () => {
  it("đóng gói kwargs để worker Python đọc được", () => {
    const payload = {
      task_schema_version: TASK_SCHEMA_VERSION,
      job_id: "job-1",
      storage_key: "panels/c/j.png",
      prompt: "mưa",
      negative_prompt: "blurry",
      seed: 3,
      width: 1024,
      height: 1024,
      steps: 20,
    };
    const message = celeryMessage("task-1", payload);
    const headers = message.headers as { task: string; id: string };
    expect(headers.task).toBe(PANEL_TASK_NAME);
    expect(headers.id).toBe("task-1");
    const decoded = JSON.parse(Buffer.from(String(message.body), "base64").toString("utf8")) as [
      unknown[],
      typeof payload,
    ];
    expect(decoded[0]).toEqual([]);
    expect(decoded[1]).toEqual(payload);
  });
});
