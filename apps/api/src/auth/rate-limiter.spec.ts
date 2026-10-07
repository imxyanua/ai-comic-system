import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  it("cho qua tới giới hạn rồi chặn kèm số giây phải chờ", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 60_000, () => now);
    expect([limiter.hit("a"), limiter.hit("a"), limiter.hit("a")]).toEqual([0, 0, 0]);
    expect(limiter.hit("a")).toBe(60);
    now = 30_000;
    expect(limiter.hit("a")).toBe(30);
  });

  it("mở lại khi hết cửa sổ", () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1_000, () => now);
    limiter.hit("a");
    expect(limiter.hit("a")).toBeGreaterThan(0);
    now = 1_000;
    expect(limiter.hit("a")).toBe(0);
  });

  it("mỗi khoá đếm riêng và reset được", () => {
    const limiter = new RateLimiter(1, 60_000, () => 0);
    limiter.hit("a");
    expect(limiter.hit("b")).toBe(0);
    expect(limiter.hit("a")).toBeGreaterThan(0);
    limiter.reset("a");
    expect(limiter.hit("a")).toBe(0);
  });
});
