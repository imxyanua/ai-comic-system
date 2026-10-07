import { computeIdempotencyKey } from "./idempotency";

describe("computeIdempotencyKey", () => {
  const base = {
    panelId: "panel-1",
    prompt: "mưa",
    negativePrompt: "blurry",
    seed: 7,
    width: 1024,
    height: 1024,
    steps: 20,
  };

  it("ổn định với cùng tham số", () => {
    expect(computeIdempotencyKey(base)).toBe(computeIdempotencyKey({ ...base }));
  });

  it("đổi khi seed đổi", () => {
    expect(computeIdempotencyKey(base)).not.toBe(computeIdempotencyKey({ ...base, seed: 8 }));
  });
});
