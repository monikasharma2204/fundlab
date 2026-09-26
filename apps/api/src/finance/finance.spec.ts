import { Dec } from './money';
import {
  FinanceRuleError,
  LedgerTrade,
  checkBuy,
  checkSell,
  proceedsForUnits,
  replayLedger,
  unitsForAmount,
  valuePortfolio,
} from './portfolio';
import { annualisedReturnPct, isNavStale, shiftMonths, todayInIndia, trailingReturnPct } from './nav';
import { computeNudges } from './nudges';

const d = (v: string | number) => new Dec(v);
const buy = (schemeCode: number, amount: string, units: string): LedgerTrade => ({
  type: 'BUY',
  schemeCode,
  amount: d(amount),
  units: d(units),
});
const sell = (schemeCode: number, amount: string, units: string): LedgerTrade => ({
  type: 'SELL',
  schemeCode,
  amount: d(amount),
  units: d(units),
});
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof FinanceRuleError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
};

describe('unitsForAmount', () => {
  it('₹10,000 at NAV ₹250 buys exactly 40 units', () => {
    expect(unitsForAmount(d(10000), d(250)).toFixed(3)).toBe('40.000');
  });

  it('rounds DOWN to 3 decimal places (never allots unpaid-for units)', () => {
    // 10000 / 162.9607 = 61.3645... → 61.364, not 61.365
    expect(unitsForAmount(d(10000), d('162.9607')).toFixed(3)).toBe('61.364');
    // 1000 / 3 = 333.3333... → 333.333
    expect(unitsForAmount(d(1000), d(3)).toString()).toBe('333.333');
  });

  it('is exact where floating point is not (0.1 + 0.2 style inputs)', () => {
    // As JS numbers 0.3 / 0.1 = 2.9999999999999996. Decimal gives exactly 3.
    expect(unitsForAmount(d('0.3'), d('0.1')).toString()).toBe('3');
  });

  it.each([
    ['zero amount', '0', '250', 'INVALID_AMOUNT'],
    ['negative amount', '-500', '250', 'INVALID_AMOUNT'],
    ['more than 2 dp of rupees', '100.001', '250', 'INVALID_AMOUNT'],
    ['zero NAV', '1000', '0', 'INVALID_NAV'],
    ['negative NAV', '1000', '-3', 'INVALID_NAV'],
    ['amount too small for 0.001 units', '1', '5588.6578', 'INVALID_AMOUNT'],
  ])('rejects %s', (_label, amount, nav, code) => {
    expect(codeOf(() => unitsForAmount(d(amount), d(nav)))).toBe(code);
  });
});

describe('proceedsForUnits', () => {
  it('selling 20 units at ₹255 credits ₹5,100', () => {
    expect(proceedsForUnits(d(20), d(255)).toFixed(2)).toBe('5100.00');
  });

  it('rounds DOWN to the paisa', () => {
    // 1.234 × 99.9999 = 123.3998766 → 123.39
    expect(proceedsForUnits(d('1.234'), d('99.9999')).toFixed(2)).toBe('123.39');
  });

  it.each([
    ['zero units', '0', 'INVALID_UNITS'],
    ['negative units', '-1', 'INVALID_UNITS'],
    ['more than 3 dp of units', '1.0001', 'INVALID_UNITS'],
  ])('rejects %s', (_l, units, code) => {
    expect(codeOf(() => proceedsForUnits(d(units), d(255)))).toBe(code);
  });
});

describe('replayLedger', () => {
  const corpus = d(100000);

  it('starts with all cash and no positions', () => {
    const s = replayLedger(corpus, []);
    expect(s.cash.toString()).toBe('100000');
    expect(s.positions.size).toBe(0);
  });

  it('BUY 40 + BUY 20 − SELL 10 leaves 50 units (playbook example)', () => {
    const s = replayLedger(corpus, [buy(1, '10000', '40'), buy(1, '5100', '20'), sell(1, '2550', '10')]);
    expect(s.positions.get(1)?.units.toString()).toBe('50');
    expect(s.cash.toString()).toBe(d(100000).minus(10000).minus(5100).plus(2550).toString());
  });

  it('aggregates repeated buys and keeps fractional units exact', () => {
    const s = replayLedger(corpus, [buy(7, '1000', '6.136'), buy(7, '1000', '6.137'), buy(7, '1000', '6.001')]);
    expect(s.positions.get(7)?.units.toString()).toBe('18.274');
    expect(s.positions.get(7)?.costBasis.toString()).toBe('3000');
  });

  it('reduces cost basis proportionally on a partial sell (average cost)', () => {
    const s = replayLedger(corpus, [buy(1, '10000', '40'), sell(1, '5100', '10')]);
    expect(s.positions.get(1)?.costBasis.toString()).toBe('7500');
  });

  it('removes the position completely after selling every unit', () => {
    const s = replayLedger(corpus, [buy(1, '10000', '40'), sell(1, '10200', '40')]);
    expect(s.positions.has(1)).toBe(false);
    expect(s.cash.toString()).toBe('100200');
  });

  it('refuses a ledger that sells units it never held', () => {
    expect(codeOf(() => replayLedger(corpus, [sell(1, '100', '1')]))).toBe('LEDGER_INCONSISTENT');
  });

  it('refuses a ledger that implies negative cash', () => {
    expect(codeOf(() => replayLedger(d(1000), [buy(1, '1001', '4')]))).toBe('LEDGER_INCONSISTENT');
  });
});

describe('checkBuy / checkSell', () => {
  const state = replayLedger(d(100000), [buy(1, '10000', '40')]);

  it('allows spending exactly all remaining cash', () => {
    expect(checkBuy(state, d(90000), d(250)).toString()).toBe('360');
  });

  it('rejects buying more than available cash', () => {
    expect(codeOf(() => checkBuy(state, d('90000.01'), d(250)))).toBe('INSUFFICIENT_CASH');
  });

  it('rejects amounts below the ₹100 minimum', () => {
    expect(codeOf(() => checkBuy(state, d(99), d(250)))).toBe('AMOUNT_BELOW_MINIMUM');
  });

  it('rejects zero, negative, and zero-NAV buys', () => {
    expect(codeOf(() => checkBuy(state, d(0), d(250)))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => checkBuy(state, d(-10), d(250)))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => checkBuy(state, d(1000), d(0)))).toBe('INVALID_NAV');
  });

  it('allows selling exactly the units held', () => {
    expect(checkSell(state, 1, d(40), d(255)).toFixed(2)).toBe('10200.00');
  });

  it('rejects selling more units than owned', () => {
    expect(codeOf(() => checkSell(state, 1, d('40.001'), d(255)))).toBe('INSUFFICIENT_UNITS');
  });

  it('rejects selling a fund not held at all', () => {
    expect(codeOf(() => checkSell(state, 999, d(1), d(255)))).toBe('INSUFFICIENT_UNITS');
  });

  it('rejects a sell worth less than a paisa', () => {
    expect(codeOf(() => checkSell(state, 1, d('0.001'), d('5')))).toBe('INVALID_UNITS');
  });
});

describe('valuePortfolio', () => {
  it('values the playbook example: 40 units, NAV 250 → 255, +₹200, +0.2% on ₹1,00,000', () => {
    const state = replayLedger(d(100000), [buy(1, '10000', '40')]);
    const v = valuePortfolio(d(100000), state, new Map([[1, { nav: d(255), navDate: '2026-09-25' }]]));
    expect(v.cash.toString()).toBe('90000');
    expect(v.holdingsValue.toString()).toBe('10200');
    expect(v.totalValue.toString()).toBe('100200');
    expect(v.gain.toString()).toBe('200');
    expect(v.returnPct.toString()).toBe('0.2');
    expect(v.holdings[0].returnPct?.toString()).toBe('2'); // the fund itself is +2%
  });

  it('portfolio value always equals cash + Σ holding values', () => {
    const state = replayLedger(d(100000), [
      buy(1, '25000', '153.411'),
      buy(2, '30000', '333.333'),
      sell(1, '5000.12', '30.5'),
    ]);
    const navs = new Map([
      [1, { nav: d('170.1234'), navDate: '2026-09-25' }],
      [2, { nav: d('88.8888'), navDate: '2026-09-25' }],
    ]);
    const v = valuePortfolio(d(100000), state, navs);
    const sum = v.holdings.reduce((s, h) => s.plus(h.units.mul(h.nav)), new Dec(0));
    expect(v.totalValue.equals(v.cash.plus(sum))).toBe(true);
    expect(v.gain.equals(v.totalValue.minus(100000))).toBe(true);
  });

  it('uses the NAV it is given (latest), not the purchase NAV', () => {
    const state = replayLedger(d(100000), [buy(1, '10000', '40')]);
    const v = valuePortfolio(d(100000), state, new Map([[1, { nav: d(240), navDate: '2026-09-25' }]]));
    expect(v.holdingsValue.toString()).toBe('9600');
    expect(v.returnPct.toString()).toBe('-0.4');
  });

  it('refuses to value a holding with no NAV rather than guessing', () => {
    const state = replayLedger(d(100000), [buy(1, '10000', '40')]);
    expect(codeOf(() => valuePortfolio(d(100000), state, new Map()))).toBe('INVALID_NAV');
  });
});

describe('NAV dates', () => {
  it('treats a NAV up to 7 days old as fresh (weekends and holidays)', () => {
    expect(isNavStale('2026-09-25', '2026-09-28')).toBe(false); // Fri NAV on Mon
    expect(isNavStale('2026-09-19', '2026-09-26')).toBe(false);
  });

  it('treats an 8-day-old or future-dated NAV as stale', () => {
    expect(isNavStale('2026-09-18', '2026-09-26')).toBe(true);
    expect(isNavStale('2018-05-25', '2026-09-26')).toBe(true); // wound-up scheme
    expect(isNavStale('2026-09-27', '2026-09-26')).toBe(true);
  });

  it('computes today in IST, not UTC', () => {
    // 20:00 UTC on the 25th is 01:30 IST on the 26th.
    expect(todayInIndia(new Date('2026-09-25T20:00:00Z'))).toBe('2026-09-26');
  });

  it('shifts months and clamps month-end dates', () => {
    expect(shiftMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonths('2026-09-25', -12)).toBe('2025-09-25');
  });

  it('computes a 1-year return using the last NAV on or before the start date', () => {
    const history = [
      { date: '2025-09-24', nav: d(100) },
      { date: '2025-09-26', nav: d(101) },
      { date: '2026-09-25', nav: d(112) },
    ];
    expect(trailingReturnPct(history, 12)?.toString()).toBe('12');
  });

  it('annualises multi-year returns: NAV 100 → 200 over 3 years is ≈25.99% a year, not 100%', () => {
    const history = [
      { date: '2023-09-25', nav: d(100) },
      { date: '2026-09-25', nav: d(200) },
    ];
    expect(trailingReturnPct(history, 36)?.toString()).toBe('100');
    expect(annualisedReturnPct(history, 36)?.toFixed(2)).toBe('25.99');
  });

  it('returns null when history is too short for the window', () => {
    const history = [
      { date: '2026-03-01', nav: d(100) },
      { date: '2026-09-25', nav: d(112) },
    ];
    expect(trailingReturnPct(history, 12)).toBeNull();
  });
});

describe('computeNudges', () => {
  const now = new Date('2026-09-26T10:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const value = (trades: LedgerTrade[], navs: Array<[number, string]>) =>
    valuePortfolio(
      d(100000),
      replayLedger(d(100000), trades),
      new Map(navs.map(([c, n]) => [c, { nav: d(n), navDate: '2026-09-25' }])),
    );
  const goodReason = 'Large companies should be steadier over a few years';

  it('flags a student who has not invested', () => {
    const codes = computeNudges(value([], []), [], now).map((n) => n.code);
    expect(codes).toEqual(['NOT_STARTED']);
  });

  it('flags concentration above 60% of the portfolio', () => {
    const v = value([buy(1, '94000', '376')], [[1, '250']]);
    const codes = computeNudges(v, [{ type: 'BUY', reason: goodReason, createdAt: daysAgo(1) }], now).map((n) => n.code);
    expect(codes).toContain('CONCENTRATED');
  });

  it('flags short or copy-pasted reasons', () => {
    const v = value([buy(1, '30000', '120'), buy(2, '30000', '120')], [[1, '250'], [2, '250']]);
    const trades = [
      { type: 'BUY' as const, reason: 'good fund', createdAt: daysAgo(1) },
      { type: 'BUY' as const, reason: 'good fund', createdAt: daysAgo(1) },
    ];
    expect(computeNudges(v, trades, now).map((n) => n.code)).toContain('THIN_REASONING');
  });

  it('flags idle cash only after a few days, not on day one', () => {
    const v = value([buy(1, '10000', '40')], [[1, '250']]);
    const fresh = computeNudges(v, [{ type: 'BUY', reason: goodReason, createdAt: daysAgo(1) }], now);
    const later = computeNudges(v, [{ type: 'BUY', reason: goodReason, createdAt: daysAgo(4) }], now);
    expect(fresh.map((n) => n.code)).not.toContain('IDLE_CASH');
    expect(later.map((n) => n.code)).toContain('IDLE_CASH');
  });

  it('flags frequent selling', () => {
    const v = value([buy(1, '30000', '120'), buy(2, '30000', '120'), buy(3, '30000', '120')], [[1, '250'], [2, '250'], [3, '250']]);
    const trades = [
      { type: 'BUY' as const, reason: goodReason, createdAt: daysAgo(6) },
      { type: 'SELL' as const, reason: null, createdAt: daysAgo(3) },
      { type: 'SELL' as const, reason: null, createdAt: daysAgo(2) },
      { type: 'SELL' as const, reason: null, createdAt: daysAgo(1) },
    ];
    expect(computeNudges(v, trades, now).map((n) => n.code)).toContain('CHURNING');
  });

  it('never flags a student just because their return is negative', () => {
    // Diversified, well-reasoned, mostly invested — but the market fell 10%.
    const v = value(
      [buy(1, '30000', '120'), buy(2, '30000', '120'), buy(3, '30000', '120')],
      [[1, '225'], [2, '225'], [3, '225']],
    );
    expect(v.returnPct.lt(0)).toBe(true);
    const trades = [1, 2, 3].map(() => ({ type: 'BUY' as const, reason: goodReason + ' and diversify', createdAt: daysAgo(5) }));
    trades[1].reason = 'Mid caps can grow faster, I accept more ups and downs';
    trades[2].reason = 'A debt fund to keep part of my money stable';
    expect(computeNudges(v, trades, now)).toEqual([]);
  });
});
