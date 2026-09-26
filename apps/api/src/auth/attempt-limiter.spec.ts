import { AttemptLimiter } from './attempt-limiter';

describe('AttemptLimiter', () => {
  it('allows exactly `limit` attempts, then locks — even when they are all reserved before any completes', () => {
    const limiter = new AttemptLimiter(5, 60_000);
    // Simulates 40 parallel requests: every reserve() happens before any bcrypt finishes.
    const allowed = Array.from({ length: 40 }, () => limiter.reserve('BLUE42:riya')).filter(Boolean).length;
    expect(allowed).toBe(5);
  });

  it('a successful attempt resets the count', () => {
    const limiter = new AttemptLimiter(3, 60_000);
    limiter.reserve('k');
    limiter.reserve('k');
    limiter.succeed('k');
    expect([limiter.reserve('k'), limiter.reserve('k'), limiter.reserve('k'), limiter.reserve('k')]).toEqual([true, true, true, false]);
  });

  it('unlocks after the lock period', () => {
    let now = 0;
    const limiter = new AttemptLimiter(2, 1000, 100, () => now);
    limiter.reserve('k');
    limiter.reserve('k');
    expect(limiter.reserve('k')).toBe(false);
    now = 1001;
    expect(limiter.reserve('k')).toBe(true);
  });

  it('clear() lets a teacher unlock a student', () => {
    const limiter = new AttemptLimiter(1, 60_000);
    limiter.reserve('k');
    expect(limiter.reserve('k')).toBe(false);
    limiter.clear('k');
    expect(limiter.reserve('k')).toBe(true);
  });

  it('keys are independent', () => {
    const limiter = new AttemptLimiter(1, 60_000);
    limiter.reserve('a');
    expect(limiter.reserve('a')).toBe(false);
    expect(limiter.reserve('b')).toBe(true);
  });

  it('does not grow without bound', () => {
    const limiter = new AttemptLimiter(5, 60_000, 100);
    for (let i = 0; i < 1000; i++) limiter.reserve(`k${i}`);
    expect((limiter as unknown as { entries: Map<string, unknown> }).entries.size).toBeLessThanOrEqual(100);
  });
});
