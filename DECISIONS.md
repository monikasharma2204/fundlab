# DECISIONS

The calls in this build that had no obvious right answer, what I chose, and what I'd change with more time. The "Evidence" lines point at the code or test that proves the choice is real, not aspirational.

---

## 1. What price does a trade execute at?

**The problem.** Real mutual-fund orders use *forward pricing*. An order placed before the cut-off (3 pm) gets that day's NAV, which is only published that night. The obvious simulator shortcut is to execute instantly at the *latest published* NAV. That creates a real exploit. On a day the market is clearly up, a student can buy at yesterday's NAV and be almost guaranteed a gain the next day. SEBI's cut-off rules exist to stop exactly this.

**Options.**
- **A. Latest published NAV, instant.** The student sees the result immediately, but the exploit exists.
- **B. Forward pricing.** The order is recorded as *pending* and settles at the first NAV dated after the order. This is realistic and closes the exploit. It costs a pending state, reserved cash, a settlement step and UI for "waiting". A fifteen-year-old also sees nothing happen until tomorrow.

**Decision: A, for this timebox, with the exploit named and partly contained.**
- Every trade stores and displays the NAV **and the date it was published for**. The UI never says "live price" (`Trade.navUsed`, `Trade.navDate`).
- The student confirms against a specific NAV date. If a newer NAV was published while the page was open, the server refuses the trade with `409 NAV_CHANGED` instead of executing at a price they never saw (`TradingService.quoteFor`).
- The leaderboard is visible only to the teacher and is explicitly not the measure of learning (see #3 and #4). That removes most of the incentive to game it.

**What I'd build next:** B. It is the first change I'd make if this went to a real classroom. The shape is a `PendingOrder` row with cash reserved by the ledger, settled lazily on the next read after a newer NAV exists. The existing `replayLedger` + row lock design supports that without restructuring.

**Evidence:** `test/api.e2e-spec.ts` → "refuses to execute at a NAV the student did not see".

---

## 2. Rounding: where do the paise go?

**The problem.** ₹10,000 at a NAV of ₹162.9607 is 61.3645… units. The brief says correctness of money matters most, and the plan I started from said "never round stored units". Real funds don't work that way: allotments on an RTA statement are 3 decimal places.

**Decision.**
- **Buy:** units = amount ÷ NAV, **rounded down** to 3 dp. The **full amount** is debited, so a student can lose at most 0.001 × NAV to rounding, exactly as in a real account.
- **Sell:** proceeds = units × NAV, **rounded down** to the paisa.
- Everything is `decimal.js` in the domain layer and `NUMERIC` in Postgres. Money leaves the API as strings. The only JS `number` use is formatting for display.

Both roundings go **down**, so the simulation can never create money. I considered rounding half-even on sells. It's fairer on average, but it makes "buy then immediately sell returns ≤ what you paid" untrue. That invariant is simple to explain and test, so I kept it.

**Consequence I chose to show, not hide.** Right after a buy, a student can see "−₹0.03". An early version rounded the display to whole rupees and showed a red "−₹0", which looked like a bug. The UI now shows paise when the gain is under ₹100.

**Evidence:** `src/finance/finance.spec.ts` (unit rounding, 0.3/0.1 float trap, conservation). Tester agent: 9 buys and 5 sells checked against exact integer arithmetic; repeated buy→sell cycles never increased cash.

---

## 3. What counts as "struggling"?

**The problem.** The brief asks the teacher to see "who's leading and who's struggling". The easy reading is that struggling means negative returns. That's wrong. A diversified, well-reasoned portfolio can be down in a falling month, and an all-in bet can be up.

This isn't hypothetical. With the real NAVs on the day I seeded the demo, the market had fallen for two months. **Tara, who kept 90% in cash, topped the leaderboard.** Riya, whose portfolio is the one a teacher would hold up as the example, was sixth.

**Decision.** "Leading" is the return leaderboard, because the brief asks for it. "Struggling" is a separate panel, **Needs a Nudge**, driven only by behaviour:

| Signal | Rule | Why this threshold |
|---|---|---|
| Not started | no buys yet | — |
| Concentrated | one fund > 60% of the whole portfolio | Above half is a single bet, whatever the category |
| Thin reasoning | ≥ half of buy reasons are < 5 words or copy-pasted | The reason is the learning; "good fund good fund" isn't one |
| Idle cash | > 50% cash, 3+ days after first buy | Not on day one; they may still be researching |
| Churning | 3+ sells in 7 days | Reacting to daily moves |

There is a test that a diversified, well-reasoned student with a **−10%** portfolio gets **no** nudge.

**What's weak about it:** the thresholds are my judgement, not research. In production they should be teacher-adjustable per class. The copy-paste check is also easy to game with small edits.

**Evidence:** `src/finance/nudges.ts`, `finance.spec.ts` → "never flags a student just because their return is negative".

---

## 4. Who is on the leaderboard, and who sees it?

- **Students who haven't invested are listed but not ranked.** Otherwise 100% cash at 0.00% outranks everyone who took a sensible position and is slightly down, which rewards doing nothing.
- **Students don't see the leaderboard.** A visible ranking of returns among teenagers pushes toward the riskiest fund. Students see their own portfolio, their own decisions and a daily reflection question.
- **Class average and median** are over invested students only. Both are shown because one student's all-in bet can drag the average.
- **Known unfairness:** a student who joins three weeks late faces a different market. Everyone's return is measured from their own start, so this is visible but not corrected.

---

## 5. Which funds, and how many?

**Decision:** 16 real schemes across index, large, flexi, mid and small cap, hybrid, debt, liquid and gold. **Direct plan, Growth option only.**

- **Not the full catalogue.** Thousands of schemes, mostly Direct/Regular × Growth/IDCW variants of the same portfolio, would turn the lesson into catalogue navigation. The decision I want students making is *allocation*.
- **No Regular plans.** They hold the same portfolio at a higher cost, so showing both teaches only how to pick the worse one.
- **No IDCW (dividend) plans.** Their NAV drops on every payout. I don't model payouts, so a holder would appear to lose money they actually received.
- **Two funds in some categories** (two large cap, two small cap, two corporate bond) so students can see that same-category funds still differ.
- **Every scheme is verified against the live provider on every seed.** The name must match and the latest NAV must be recent. One candidate I considered (ICICI Short Term Gilt, 120608) last published a NAV in **May 2018**, so it is excluded.

---

## 6. When is a NAV too old to trade on?

NAVs publish once per working day, so "latest" can legitimately be three or four days old across a weekend and holiday.

**Decision: 7 calendar days.** Older means trading on that fund is blocked. A future-dated NAV is also treated as invalid.

Reads follow two policies:
- **Trading fails closed.** It needs a successfully fetched, non-stale NAV. If the provider is down and the cache is older than 30 minutes, the trade is refused with "No investment has been recorded". It never falls back to an old cached price.
- **Browsing and valuation are best-effort.** They may show the last cached NAV, always with its date.

"Today" is computed in IST, because that's where NAVs are published. A UTC server would otherwise be a day behind for 5.5 hours every evening.

**Evidence:** e2e → "provider outage blocks the trade…", "a stale NAV (10 days old)…", "a weekend-old NAV (3 days) is still tradable…".

---

## 7. How do students log in?

Teenagers in a classroom shouldn't need an email address or a password, and I don't want to store PII about minors.

**Decision.**
- The student joins with the **class code + a display name**.
- The server generates a **6-digit PIN**, shown once, which works on other devices.
- A lost PIN is reset by the teacher. The reset also **signs the student out everywhere** (`tokenVersion`) in case the PIN leaked.

Trade-offs I had to fix after testing (see AI_LOG):
- A 6-digit PIN is brute-forceable. There is a per-student lock after 5 wrong PINs, plus a per-IP limit on `/auth`. The first version of the lock could be bypassed with parallel requests.
- Names are unique **case- and space-insensitively**. Otherwise "Ravi", "ravi" and "RAVI" can be three students on the teacher's screen.
- The per-IP limit defaults to 60/min, not something tight like 10. A whole class joining from one school IP must not be throttled.
- The attempt counters are **in memory**. That's correct for one API instance. Several instances would need them in Postgres or Redis.

---

## 8. Balances vs. a ledger, and who enforces it

**Decision:** no balance column anywhere.
- `Trade` rows are the source of truth. Cash, holdings and value are derived by replaying them (`replayLedger`).
- The database enforces what matters even if the app is wrong: a trigger rejects any `UPDATE` or `DELETE` on trades, and `CHECK` constraints require positive amounts, units and NAVs and a reason on every BUY.
- Replay order is a `BIGSERIAL seq`, not `createdAt`, which can tie within a millisecond.

**Concurrency:** because cash is derived, two simultaneous buys could both read ₹1,00,000. Every trade takes `SELECT … FOR UPDATE` on the student row inside the transaction before replaying the ledger. The NAV is fetched *before* the transaction, so a slow provider never holds a lock.

**The cost:** removing test data means dropping the schema (`npm run db:reset -- --yes`). Deleting trades is impossible by design.

**Evidence:** e2e → "two simultaneous ₹60,000 buys…", "the database refuses to UPDATE or DELETE a trade". Tester agent: 10 parallel ₹300 buys against ₹1,000 → exactly 3 succeed, across 3 runs.

---

## 9. Stack, and a constraint I didn't choose

- **React + NestJS + Prisma + Neon Postgres** rather than Next.js + Supabase. It has a clear API boundary, the MCP server reuses that API instead of the database, and it's a stack I can defend line by line. The cost is two deployables instead of one.
- **Pinned versions:**
  - NestJS **11**, not 12. 12 is ESM-only and only weeks old at the time of this build.
  - Prisma **7.10**, not the npm `latest` tag, which currently points at an 8.0 release candidate.
  - TypeScript **5.9**, not 7. ts-jest doesn't support 7 yet.
- **Neon over WebSockets.** The build environment couldn't reach Postgres on TCP 5432, so the app uses Neon's WebSocket driver (`@prisma/adapter-neon`). `prisma migrate deploy` needs TCP, so `prisma/migrate.ts` applies the same SQL migration files over the WebSocket driver and records them in `_fundlab_migrations`. On a normal network, Prisma's own migrate would also work.

---

## 10. The MCP server: what it may and may not do

- **Read-only, by construction.** It has five tools, all GETs against the REST API, logged in as one teacher. There is no buy/sell tool: a trade must come from a student, with the student's own reason.
- **No database access and no financial logic.** It can't disagree with the app, and it sees exactly what that teacher sees in the UI.
- **Student-written text is untrusted.** Tool descriptions and server instructions tell the assistant that `reason` fields are data, not instructions. That's a mitigation, not a guarantee.
- **Known gap:** it authenticates with the teacher's full credentials. Those can also create classes and reset PINs over the API, even though the MCP never does. Production should issue a read-only scoped token.

---

## 11. What I deliberately left out

Real money, payments, KYC, broker/demat integration, real orders, SIPs, tax, exit loads, forward pricing (see #1), IDCW payouts, risk profiling, AI fund recommendations, chat, notifications, a mobile app, parent accounts, grading, badges and confetti.

Each is either irrelevant to "can a classroom learn to make and explain an investment decision?" or actively works against it. AI recommendations, for example, would outsource the exact decision the student is supposed to make.
