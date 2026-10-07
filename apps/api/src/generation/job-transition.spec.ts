import { applyJobCallback } from "./job-transition";

describe("applyJobCallback", () => {
  it("chuyển queued sang running và chưa gắn ảnh", () => {
    expect(applyJobCallback("queued", "running")).toEqual({
      type: "change",
      jobStatus: "running",
      panelStatus: "running",
      markAssetReady: false,
      attachImage: false,
    });
  });

  it("chấp nhận running khi job còn pending", () => {
    expect(applyJobCallback("pending", "running")).toMatchObject({
      type: "change",
      jobStatus: "running",
    });
  });

  it("succeeded gắn ảnh và đánh dấu asset sẵn sàng", () => {
    expect(applyJobCallback("running", "succeeded")).toEqual({
      type: "change",
      jobStatus: "succeeded",
      panelStatus: "succeeded",
      markAssetReady: true,
      attachImage: true,
    });
  });

  it("failed không đổi ảnh hiện tại", () => {
    expect(applyJobCallback("running", "failed")).toMatchObject({
      type: "change",
      jobStatus: "failed",
      panelStatus: "failed",
      attachImage: false,
    });
  });

  it("callback trùng trạng thái là no-op", () => {
    expect(applyJobCallback("succeeded", "succeeded")).toEqual({ type: "noop" });
    expect(applyJobCallback("failed", "failed")).toEqual({ type: "noop" });
    expect(applyJobCallback("running", "running")).toEqual({ type: "noop" });
  });

  it("không hạ job đã thành công xuống failed", () => {
    expect(applyJobCallback("succeeded", "failed")).toEqual({ type: "conflict" });
  });

  it("không nhận callback thành công sau khi đã hủy", () => {
    expect(applyJobCallback("cancelled", "succeeded")).toEqual({ type: "conflict" });
  });
});
