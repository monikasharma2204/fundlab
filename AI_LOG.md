# AI_LOG

**How this was built.** Monika directed the work. Claude (Opus 5.5) did most of the implementation in an agentic coding session, following an Orchestrator → Developer → Reviewer → Tester workflow (see `AGENTS.md`):

- The orchestrating agent planned and wrote the code.
- Two separate sub-agents did an independent code review and black-box testing. Neither was allowed to edit code.

This log records what actually happened, including the parts that went wrong. Nothing here is smoothed over.

---

## Where AI got it wrong, and what caught it

### 1. The PIN lockout could be bypassed with parallel requests _(caught by the Tester agent)_

- **What happened:** the first login limiter read the failure count, awaited the DB lookup and bcrypt, then wrote `count + 1`. Forty requests sent at once all read "0 failures", so none was ever locked out. The Tester logged in with the correct PIN inside a burst of 61 parallel guesses. Sending the same guesses one at a time locked correctly, which is why my own tests missed it.
- **Fix:** attempts are now _reserved synchronously_ before any `await`, so at most 5 can be in flight per student (`src/auth/attempt-limiter.ts`). There is also a per-IP limit on `/auth`.
- **Regression test:** 40 parallel wrong PINs → ≤5 are evaluated, and the correct PIN is then refused.

### 2. "Ravi", "ravi" and "RAVI" were three different students _(Tester)_

- **What happened:** uniqueness was on the exact display name. The PIN-lock key was lower-cased, though, so a classmate could also lock someone out on purpose.
- **Fix:** added a normalised `nameKey` with a unique index. Login ignores case and spacing.

### 3. A PIN reset didn't sign anyone out _(Reviewer agent)_

- **What happened:** the teacher's only recovery tool left a 30-day token working for whoever had the leaked PIN.
- **Fix:** added `Student.tokenVersion`, which goes into the JWT, is checked by the guard, and is bumped on reset.
- The Reviewer also found that a token for a deleted account produced a **500**, not a 401. The guard now checks the account exists.

### 4. Races and bad input produced 500s _(Reviewer + Tester)_

- **What happened:** join, signup and class creation did "check it's free, then insert". Two simultaneous joins with the same name produced one 201 and one 500.
- More bad input that reached the database or crashed:
  - `schemeCode: ["120716"]` was coerced to a number and a trade executed.
  - `schemeCode: 99999999999` reached an INT4 column.
  - A 200 KB body produced a 500.
- **Fix:**
  - The unique index decides duplicates, and `P2002` is mapped to 409.
  - Scheme codes accept only 1–6 digits.
  - Bodies are capped at 16 KB and body-parser errors are mapped to 413/400.

### 5. The student confirmed one price and could get another _(Reviewer)_

- **What happened:** if a new NAV was published while the fund page was open, the trade executed at a price the student never saw.
- **Fix:** the UI now sends `expectedNavDate`. If it differs, the server returns `409 NAV_CHANGED` and the UI reloads the new price.

### 6. Backward pricing makes the leaderboard gameable _(Reviewer, rated HIGH)_

- **Decision: not fixed. Accepted and documented** in DECISIONS #1, with the forward-pricing design written out as the next step.
- I considered the Reviewer's severity rating and disagreed that it blocks an MVP. The leaderboard is teacher-only and explicitly not the learning measure. Building pending orders would roughly double the trading code I'd have to defend live.

### 7. The plan I started from said "never round stored units"

- **What happened:** the AI-generated planning document (the "agents" brief) insisted on unrounded units. Real RTA statements allot units to 3 dp, and an unrounded unit count isn't something a real account would show.
- **Fix:** round down to 3 dp and debit the full amount (DECISIONS #2).
- The same plan proposed a separate `financial-core` package, Redux, Swagger, a four-package monorepo and a seven-file docs folder. I cut these to keep the codebase small enough to explain line by line.

### 8. From-memory fund codes included a dead scheme

- **What happened:** I (the AI) proposed a candidate list from memory. Checking each code's latest NAV against MFAPI showed that 120608 (ICICI Short Term Gilt) last published in **2018**.
- That led to two changes:
  - the 7-day staleness rule;
  - the seed re-verifying every scheme's name and NAV freshness live, and refusing to run otherwise.

### 9. MFAPI says SUCCESS for schemes that don't exist

- **What happened:** probing the API showed that an unknown scheme code returns HTTP 200, `"status":"SUCCESS"`, `scheme_code: 0` and empty data.
- A naive adapter would have treated that as valid, so the adapter now checks the scheme code matches and the data isn't empty.

### 10. `npm install <latest>` would have pulled pre-release or breaking versions

- **What happened:**
  - Prisma's npm `latest` tag pointed at `8.0.0-rc.17`.
  - NestJS 12 (released 27 Aug 2026) is ESM-only.
  - TypeScript `latest` is 7.0, which ts-jest doesn't support.
- **Fix:** checked each tag before installing and pinned Prisma 7.10, Nest 11 and TS 5.9.

### 11. Small mistakes caught by tests or screenshots

- **Zero amount reached the provider:** a `₹0` buy was rejected, but only after fetching a NAV. Validation now happens first.
- **"−₹0" display:** after a buy, the gain showed as a red "−₹0" (really −₹0.03). I spotted it in a UI screenshot; the display now shows paise for small gains.
- **Test-side bugs (the app was right):**
  - The test helper created teachers named "T", which the API correctly rejected (minimum 2 characters).
  - An E2E test navigated before login finished.
- **Tooling slips:**
  - A `sed` edit to the Jest config silently didn't apply because of escaping.
  - A `pkill -f` pattern matched and killed its own shell.
  - Both were noticed from the output and redone.

---

## Where AI helped most

- **Probing real data before trusting it:** MFAPI's error behaviour, stale schemes, and NAV dates across weekends.
- **Independent review with no stake in the code.** The Reviewer and Tester found every security issue in #1 to #5; my own tests had passed all of them.
- **Tedious-but-important checks:**
  - exact-decimal recomputation of every trade;
  - concurrency bursts;
  - reading the `@prisma/adapter-neon` source to confirm the `FOR UPDATE` lock and the transaction share one connection.

## What I verified myself rather than trusting

- Every money formula has a unit test with a hand-computed answer, including the playbook's examples: ₹10,000 at NAV 250 = 40 units, and selling 20 units at NAV 255 returns ₹5,100.
- The row lock is proven by a test that fires two ₹60,000 buys at once against ₹1,00,000 of cash.
- The immutability trigger is proven by a test that tries `UPDATE` and `DELETE`.

**Monika, before submitting:** read each file under `apps/api/src/finance`, `apps/api/src/trading` and `apps/api/src/auth` until you can explain it without AI. Those are the parts most likely to come up in the live session.
