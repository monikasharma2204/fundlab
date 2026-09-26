# AGENTS.md: how FundLab was built with agents

This file is both the **contract** every coding agent working in this repo must follow and a record of **how the workflow actually ran**.

## Roles

| Role | Did | Could not |
|---|---|---|
| **Orchestrator / Developer** (main Claude session) | Planned, implemented, ran tests, triaged findings, wrote docs | Mark work done without passing tests |
| **Reviewer** (sub-agent) | Read all source, reported findings with severity, file and fix | Edit files, start servers, write to the DB |
| **Tester** (sub-agent) | Attacked the *running* API as a black box with its own accounts | Edit files, touch the demo class |

Reviewer and Tester were deliberately given **no write access**. Their value is independence: they don't share the developer's assumptions.

## What happened

1. **Plan.** I rejected parts of the starting plan: the separate `financial-core` package, Redux, Swagger, and "never round units". See AI_LOG #7.
2. **Build.**
   - Schema and migrations first, including DB-level guards.
   - Then the pure `finance/` module, with 45 unit tests passing before any HTTP code existed.
   - Then the API, UI, seed and MCP server.
3. **Verify.**
   - 28 integration tests against a real database, run in an isolated schema.
   - 5 Playwright browser journeys.
   - A screenshot review of every screen, which caught the "−₹0" display bug.
4. **Independent review.** The Reviewer and Tester ran in parallel.
   - **Tester:** 248 checks. **Zero financial failures**: every buy, sell, rounding and concurrency invariant held exactly. It found 7 failures, one of them HIGH (the PIN lockout bypass).
   - **Reviewer:** 11 findings, 2 HIGH (the PIN lockout race, and backward pricing).
5. **Fix and re-test.**
   - Every finding was fixed with a regression test, except backward pricing, which was accepted and documented (DECISIONS #1).
   - Integration tests went from 28 to 44, and unit tests from 45 to 52. All pass.
6. **Release gate.**

## Contract for any agent changing this code

**Money**
- Never do authoritative maths with JS `number`. Use `Dec` from `src/finance/money.ts`.
- Money crosses the API as strings.
- No stored balances. Cash and holdings are derived from `Trade` rows via `replayLedger`.
- Trades are append-only; the DB trigger enforces it. Never add an UPDATE or DELETE path.
- Any new money rule goes in `src/finance/` as a pure function, with a unit test containing a hand-computed answer.

**Trading path**
- Trades are written **only** by `TradingService`.
- Fetch the NAV (fail-closed) → open a transaction → `lockStudent` → replay → check → insert one row.

**Trust**
- Never trust the client for identity, role, cash, NAV, units or ownership. Identity comes from the verified JWT.
- Teacher routes must go through `ClassroomsService.owned*`, and answer 404 (not 403) for other teachers' data.

**Fund data**
- Fund data comes only through `FundDataProvider`. Nothing outside `mfapi.provider.ts` knows MFAPI's JSON.

**MCP**
- The MCP server stays read-only and talks to the REST API, never the DB.

**Done means**
- Unit and integration tests pass (`npm test`) and the browser journeys pass.
- Docs are updated if behaviour changed.
- An AI_LOG entry is added if AI got something materially wrong.

## Release gate (evidence, not "looks good")

| Area | Evidence |
|---|---|
| Money formulas and rounding | `src/finance/finance.spec.ts` |
| Fail-closed NAV | e2e: outage, stale NAV, NAV_CHANGED → 503/409 and no trade row |
| Concurrency | e2e: two parallel ₹60k buys → one 201, one 422; Tester: 10×₹300 vs ₹1,000 → exactly 3 |
| Authorization | e2e: cross-teacher and cross-student access, role mismatch, forged/revoked/ghost tokens |
| Ledger immutability | e2e: UPDATE/DELETE rejected by the trigger; a BUY without a reason is rejected by a CHECK |
| Brute force | unit + e2e: 40 parallel wrong PINs → ≤5 evaluated; per-IP limit returns 429 |
| Robustness | e2e: bad types, huge scheme codes, 200 KB body and malformed JSON → 4xx, never 500 |
| UI journeys | `apps/web/e2e/flows.spec.ts`: teacher dashboard, class creation, student join → buy → sell |
| Secrets | `.env` git-ignored; `git grep` finds no connection strings |
