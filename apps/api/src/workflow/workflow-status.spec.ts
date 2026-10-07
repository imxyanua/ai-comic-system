import { countJobs, JobStatus, nextWorkflowStatus, WorkflowJob } from "./workflow-status";

function job(panelId: string, status: JobStatus, minute = 0): WorkflowJob {
  return { panelId, status, createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)) };
}

describe("nextWorkflowStatus", () => {
  it("giữ running khi còn job chưa xong", () => {
    expect(nextWorkflowStatus("running", [job("a", "succeeded"), job("b", "queued")])).toBe("running");
    expect(nextWorkflowStatus("running", [job("a", "pending")])).toBe("running");
  });

  it("completed khi mọi job thành công", () => {
    expect(nextWorkflowStatus("running", [job("a", "succeeded"), job("b", "succeeded")])).toBe("completed");
  });

  it("completed_with_errors khi có cả thành công và lỗi", () => {
    expect(nextWorkflowStatus("running", [job("a", "succeeded"), job("b", "failed")])).toBe("completed_with_errors");
  });

  it("job bị hủy lẻ tính là không thành công", () => {
    expect(nextWorkflowStatus("running", [job("a", "succeeded"), job("b", "cancelled")])).toBe(
      "completed_with_errors",
    );
  });

  it("failed khi không có job nào thành công", () => {
    expect(nextWorkflowStatus("running", [job("a", "failed"), job("b", "cancelled")])).toBe("failed");
    expect(nextWorkflowStatus("running", [])).toBe("failed");
  });

  it("giữ cancelled dù job còn chạy hay đã xong", () => {
    expect(nextWorkflowStatus("cancelled", [job("a", "succeeded")])).toBe("cancelled");
    expect(nextWorkflowStatus("cancelled", [job("a", "running")])).toBe("cancelled");
  });

  it("chỉ tính job mới nhất của mỗi panel sau retry", () => {
    const jobs = [job("a", "succeeded"), job("b", "failed", 1), job("b", "succeeded", 2)];
    expect(nextWorkflowStatus("completed_with_errors", jobs)).toBe("completed");
    expect(countJobs(jobs)).toEqual({ total: 2, succeeded: 2, failed: 0, cancelled: 0, pending: 0 });
  });

  it("panel chưa có job vẫn tính là đang chờ, nên batch không xong sớm", () => {
    expect(nextWorkflowStatus("running", [job("a", "succeeded")], ["a", "b"])).toBe("running");
    expect(countJobs([job("a", "succeeded")], ["a", "b"])).toEqual({
      total: 2,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      pending: 1,
    });
  });

  it("mở lại running khi retry một job trong workflow đã xong", () => {
    const jobs = [job("a", "succeeded"), job("b", "failed", 1), job("b", "queued", 2)];
    expect(nextWorkflowStatus("completed_with_errors", jobs)).toBe("running");
  });
});
