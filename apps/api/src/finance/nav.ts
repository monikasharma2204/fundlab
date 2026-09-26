/**
 * NAV date rules and trailing returns. Pure functions; dates are 'YYYY-MM-DD'
 * strings (a NAV belongs to a calendar day, not an instant).
 */
import { Dec } from './money';

export interface NavPoint {
  date: string; // YYYY-MM-DD
  nav: Dec;
}

/**
 * A NAV older than this many calendar days is treated as stale and blocks trading.
 * 7 days covers a normal weekend plus a multi-day market holiday, but catches
 * schemes that were merged or wound up (one candidate fund in the MFAPI data
 * stopped publishing in 2018).
 */
export const MAX_NAV_AGE_DAYS = 7;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function daysBetween(fromIso: string, toIso: string): number {
  if (!ISO_DATE.test(fromIso) || !ISO_DATE.test(toIso)) throw new Error(`Bad ISO date: ${fromIso} / ${toIso}`);
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function isNavStale(navDate: string, todayIso: string, maxAgeDays = MAX_NAV_AGE_DAYS): boolean {
  const age = daysBetween(navDate, todayIso);
  // A NAV dated in the future is also invalid data.
  return age < 0 || age > maxAgeDays;
}

/** Today's calendar date in India, where NAVs are published. */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp day (e.g. 31 Mar − 1 month → 28/29 Feb).
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/**
 * Point-to-point return over `months`, using the latest NAV and the last NAV
 * published on or before the start date. Returns null if history doesn't go back far enough.
 * `history` must be sorted oldest → newest.
 */
export function trailingReturnPct(history: readonly NavPoint[], months: number): Dec | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1];
  const startDate = shiftMonths(latest.date, -months);
  let start: NavPoint | undefined;
  for (const p of history) {
    if (p.date <= startDate) start = p;
    else break;
  }
  if (!start || start.nav.lte(0)) return null;
  // Too-early start (e.g. fund launched later) would overstate the window.
  if (daysBetween(start.date, startDate) > MAX_NAV_AGE_DAYS) return null;
  return latest.nav.minus(start.nav).div(start.nav).mul(100);
}

/**
 * Compound annual growth rate over `months` (for windows longer than a year).
 * CAGR = (end / start)^(12 / months) − 1. Returns null if history is too short.
 */
export function annualisedReturnPct(history: readonly NavPoint[], months: number): Dec | null {
  const total = trailingReturnPct(history, months);
  if (total === null) return null;
  const growth = total.div(100).plus(1);
  return growth.pow(new Dec(12).div(months)).minus(1).mul(100);
}
