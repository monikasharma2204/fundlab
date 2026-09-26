/**
 * Counts failed login attempts per key and locks the key after too many.
 *
 * The attempt is RESERVED synchronously, before any await. The first version
 * read the counter, awaited bcrypt, then wrote count+1 — so 60 parallel guesses
 * all saw "0 failures" and none were ever locked (found by the Tester agent).
 * Because Node runs this method without interleaving, at most `limit` attempts
 * per key can be in flight or completed within one lock window.
 *
 * In-memory: correct for one API instance. Several instances would need this in
 * Postgres or Redis (documented in DECISIONS.md).
 */
export class AttemptLimiter {
  private readonly entries = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly limit: number,
    private readonly lockMs: number,
    private readonly maxEntries = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns false if the key is locked. Otherwise counts this attempt and returns true. */
  reserve(key: string): boolean {
    const t = this.now();
    let e = this.entries.get(key);
    if (e && e.lockedUntil && e.lockedUntil <= t) {
      this.entries.delete(key); // lock expired: fresh start
      e = undefined;
    }
    if (e?.lockedUntil) return false;
    if (!e) {
      if (this.entries.size >= this.maxEntries) this.prune(t);
      e = { count: 0, lockedUntil: 0 };
      this.entries.set(key, e);
    }
    e.count += 1;
    if (e.count >= this.limit) e.lockedUntil = t + this.lockMs;
    return e.count <= this.limit;
  }

  /** A correct attempt wipes the key's failures. */
  succeed(key: string): void {
    this.entries.delete(key);
  }

  /** Used when a teacher issues a new PIN. */
  clear(key: string): void {
    this.entries.delete(key);
  }

  private prune(t: number): void {
    for (const [k, e] of this.entries) {
      if (!e.lockedUntil || e.lockedUntil <= t) this.entries.delete(k);
    }
  }
}
