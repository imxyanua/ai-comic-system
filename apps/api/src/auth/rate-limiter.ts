/** Fixed-window counter in memory. Enough for one API process; resets on restart. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns seconds to wait when the key is over the limit, or 0 when the request may proceed. */
  hit(key: string): number {
    const now = this.now();
    this.evictExpired(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      return Math.ceil((entry.resetAt - now) / 1000);
    }
    return 0;
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private evictExpired(now: number): void {
    if (this.hits.size < 10_000) {
      return;
    }
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}
