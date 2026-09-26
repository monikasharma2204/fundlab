# Screen recording script (about 4 minutes)

Set this up before recording:

- The API and web app are running.
- The demo class is freshly seeded (`npm run db:reset -w apps/api -- --yes && npm run db:seed`).
- Use two browser windows: normal for the teacher, private for the student.

## Opening (15 s)

> "FundLab is a classroom simulator for learning to make investment decisions. It uses virtual money, but real mutual funds at their real published NAVs."

## Teacher (≈90 s)

1. Log in as `demo.teacher@fundlab.app` / `fundlab-demo`.
2. Create a class, "Class 10A", with ₹1,00,000. Point at the generated code:
   > "Students join with just this code. No email, no personal data."
3. Open **Class 10B**, the seeded class. Its trades were placed at real historical NAVs.
4. **Leaderboard:**
   > "Ranked by return. Ishaan hasn't invested, so he's listed but not ranked. Otherwise sitting in cash would beat people who took sensible positions."
5. Point at Tara at the top:
   > "The market fell over the last two months, so the student with 90% in cash is winning. That's why 'leading' and 'struggling' are separate panels."
6. **Needs a Nudge:**
   > "These are behaviour, not returns. Aarav has 94% in one small-cap fund. Dev's reasons are 'good fund good fund'. Zoya sold three times this week. Riya is down 2.5% and has no nudge, because her decisions are sound."
7. Open **Dev**. Show his holdings and the reasons next to each trade, with the NAV and NAV date used.

## Student (≈90 s)

1. In the private window, join the new class code as "Asha".
2. Show the PIN screen, then the portfolio:
   > "₹1,00,000, all cash."
3. **Explore funds:**
   > "16 real funds across categories, all Direct and Growth. Every NAV shows the date it was published for. Mutual funds don't have a live price."
4. Open **UTI Nifty 50 Index Fund**. Show the chart and point at the NAV date ("for …").
5. Invest ₹20,000. Type a reason:
   > "Index of the 50 biggest companies — a low-cost base."

   Click Review, then Confirm.
6. Point at the result:
   > "The units are rounded down to 3 decimals, like a real statement, so my portfolio shows a few paise less than I paid. That's real, not a bug."
7. **History:**
   > "These can't be edited or deleted. The database itself refuses."

## Closing (30–45 s)

> "The biggest simplification: trades execute at the latest *published* NAV. That lets a student who sees the market rise buy at yesterday's price. Real funds prevent this with cut-off times. I've documented the exploit and the forward-pricing fix in DECISIONS.md. Everything money-related is derived from an append-only ledger, uses decimal arithmetic, and has tests, including parallel-request tests."
