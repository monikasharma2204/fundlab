/**
 * "Needs a Nudge" — behavioural learning signals for the teacher.
 *
 * Deliberately NOT based on returns. A thoughtful, diversified portfolio can be
 * down this week and a reckless all-in bet can be up. Returns are an outcome;
 * these signals describe the decision-making the teacher can actually coach.
 */
import { Dec } from './money';
import type { PortfolioValuation } from './portfolio';

export type NudgeCode = 'NOT_STARTED' | 'CONCENTRATED' | 'THIN_REASONING' | 'IDLE_CASH' | 'CHURNING';

export interface Nudge {
  code: NudgeCode;
  message: string;
}

export interface NudgeTrade {
  type: 'BUY' | 'SELL';
  reason: string | null;
  createdAt: Date;
}

export const NUDGE_RULES = {
  /** One fund is more than this share of the whole portfolio (cash included). */
  concentrationShare: new Dec(0.6),
  /** A reason with fewer words than this is "thin". */
  minReasonWords: 5,
  /** More than this share of cash, this many days after the first buy. */
  idleCashShare: new Dec(0.5),
  idleCashAfterDays: 3,
  /** This many sells inside the rolling window counts as churning. */
  churnSells: 3,
  churnWindowDays: 7,
} as const;

const DAY_MS = 86_400_000;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeNudges(
  valuation: PortfolioValuation,
  trades: readonly NudgeTrade[],
  now: Date,
  rules = NUDGE_RULES,
): Nudge[] {
  const nudges: Nudge[] = [];
  const buys = trades.filter((t) => t.type === 'BUY');

  if (buys.length === 0) {
    return [{ code: 'NOT_STARTED', message: "Hasn't made an investment yet." }];
  }

  const top = valuation.holdings[0];
  if (top && valuation.totalValue.gt(0)) {
    const share = top.value.div(valuation.totalValue);
    if (share.gt(rules.concentrationShare)) {
      nudges.push({
        code: 'CONCENTRATED',
        message: `${share.mul(100).toFixed(0)}% of the portfolio is in a single fund.`,
      });
    }
  }

  if (buys.length >= 2) {
    const seen = new Set<string>();
    let thin = 0;
    for (const b of buys) {
      const normalised = (b.reason ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (wordCount(normalised) < rules.minReasonWords || seen.has(normalised)) thin += 1;
      seen.add(normalised);
    }
    if (thin * 2 >= buys.length) {
      nudges.push({ code: 'THIN_REASONING', message: 'Most investment reasons are very short or copied.' });
    }
  }

  const firstBuyAt = Math.min(...buys.map((b) => b.createdAt.getTime()));
  const daysSinceFirstBuy = (now.getTime() - firstBuyAt) / DAY_MS;
  if (valuation.totalValue.gt(0) && daysSinceFirstBuy >= rules.idleCashAfterDays) {
    const cashShare = valuation.cash.div(valuation.totalValue);
    if (cashShare.gt(rules.idleCashShare)) {
      nudges.push({
        code: 'IDLE_CASH',
        message: `${cashShare.mul(100).toFixed(0)}% of the money is still sitting as cash.`,
      });
    }
  }

  const windowStart = now.getTime() - rules.churnWindowDays * DAY_MS;
  const recentSells = trades.filter((t) => t.type === 'SELL' && t.createdAt.getTime() >= windowStart).length;
  if (recentSells >= rules.churnSells) {
    nudges.push({
      code: 'CHURNING',
      message: `Sold ${recentSells} times in the last ${rules.churnWindowDays} days — lots of switching.`,
    });
  }

  return nudges;
}
