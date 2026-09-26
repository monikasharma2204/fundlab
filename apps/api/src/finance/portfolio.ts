/**
 * Pure financial rules for FundLab. No I/O, no framework imports — every
 * function here is deterministic and unit-tested in finance.spec.ts.
 *
 *   units bought    = amount / NAV            (rounded DOWN to 3 dp)
 *   sell proceeds   = units × NAV             (rounded DOWN to the paisa)
 *   cash            = starting corpus − Σ BUY amounts + Σ SELL amounts
 *   holding value   = units held × latest NAV
 *   portfolio value = cash + Σ holding values
 *   gain / loss     = portfolio value − starting corpus
 *   return %        = gain / starting corpus × 100
 */
import { Dec, MIN_BUY_RUPEES, RUPEE_DP, UNIT_DP } from './money';

export class FinanceRuleError extends Error {
  constructor(
    readonly code:
      | 'INVALID_AMOUNT'
      | 'AMOUNT_BELOW_MINIMUM'
      | 'INSUFFICIENT_CASH'
      | 'INVALID_NAV'
      | 'INVALID_UNITS'
      | 'INSUFFICIENT_UNITS'
      | 'LEDGER_INCONSISTENT',
    message: string,
  ) {
    super(message);
  }
}

export interface LedgerTrade {
  type: 'BUY' | 'SELL';
  schemeCode: number;
  units: Dec;
  amount: Dec;
}

export interface Position {
  schemeCode: number;
  units: Dec;
  /** Rupees still invested in this fund after partial sells (average-cost basis). */
  costBasis: Dec;
}

export interface LedgerState {
  cash: Dec;
  positions: Map<number, Position>;
}

/** Human-readable rupees for error messages only, e.g. ₹6,000.00. Never used for arithmetic. */
const inrText = (v: Dec) =>
  `₹${Number(v.toFixed(RUPEE_DP)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function assertPositiveNav(nav: Dec): void {
  if (!nav.isFinite() || nav.lte(0)) {
    throw new FinanceRuleError('INVALID_NAV', 'NAV must be a positive number.');
  }
}

/**
 * Units allotted for a purchase. Rounded DOWN to 3 dp: a fund never allots a
 * fraction of a unit it hasn't been paid for. The full amount is still debited,
 * so the student can lose at most 0.001 × NAV to rounding — the same as a real RTA.
 */
export function unitsForAmount(amount: Dec, nav: Dec): Dec {
  assertPositiveNav(nav);
  if (!amount.isFinite() || amount.lte(0)) {
    throw new FinanceRuleError('INVALID_AMOUNT', 'Amount must be more than zero.');
  }
  if (amount.decimalPlaces() > RUPEE_DP) {
    throw new FinanceRuleError('INVALID_AMOUNT', 'Amount can have at most 2 decimal places (paise).');
  }
  const units = amount.div(nav).toDecimalPlaces(UNIT_DP, Dec.ROUND_DOWN);
  if (units.lte(0)) {
    throw new FinanceRuleError('INVALID_AMOUNT', 'Amount is too small to buy even 0.001 units.');
  }
  return units;
}

/** Rupees credited for redeeming units. Rounded DOWN to the paisa so the simulation never creates money. */
export function proceedsForUnits(units: Dec, nav: Dec): Dec {
  assertPositiveNav(nav);
  if (!units.isFinite() || units.lte(0)) {
    throw new FinanceRuleError('INVALID_UNITS', 'Units to sell must be more than zero.');
  }
  if (units.decimalPlaces() > UNIT_DP) {
    throw new FinanceRuleError('INVALID_UNITS', 'Units can have at most 3 decimal places.');
  }
  return units.mul(nav).toDecimalPlaces(RUPEE_DP, Dec.ROUND_DOWN);
}

/**
 * Replays the trade ledger (oldest first) into cash + positions.
 * Throws if the history would ever imply negative cash or units — that means
 * the ledger is corrupt, and we refuse to show numbers built on it.
 */
export function replayLedger(startingCorpus: Dec, trades: readonly LedgerTrade[]): LedgerState {
  let cash = startingCorpus;
  const positions = new Map<number, Position>();

  for (const t of trades) {
    const pos = positions.get(t.schemeCode) ?? { schemeCode: t.schemeCode, units: new Dec(0), costBasis: new Dec(0) };
    if (t.type === 'BUY') {
      cash = cash.minus(t.amount);
      pos.units = pos.units.plus(t.units);
      pos.costBasis = pos.costBasis.plus(t.amount);
    } else {
      if (t.units.gt(pos.units)) {
        throw new FinanceRuleError('LEDGER_INCONSISTENT', `Ledger sells more units of ${t.schemeCode} than it holds.`);
      }
      const remaining = pos.units.minus(t.units);
      // Average cost: the cost basis shrinks in proportion to the units sold.
      pos.costBasis = remaining.isZero() ? new Dec(0) : pos.costBasis.mul(remaining).div(pos.units);
      pos.units = remaining;
      cash = cash.plus(t.amount);
    }
    if (cash.lt(0)) {
      throw new FinanceRuleError('LEDGER_INCONSISTENT', 'Ledger implies negative cash.');
    }
    if (pos.units.isZero()) positions.delete(t.schemeCode);
    else positions.set(t.schemeCode, pos);
  }
  return { cash, positions };
}

/** Checks a BUY against the current ledger state. Returns the units that would be allotted. */
export function checkBuy(state: LedgerState, amount: Dec, nav: Dec): Dec {
  assertPositiveNav(nav);
  if (!amount.isFinite() || amount.lte(0)) {
    throw new FinanceRuleError('INVALID_AMOUNT', 'Amount must be more than zero.');
  }
  if (amount.lt(MIN_BUY_RUPEES)) {
    throw new FinanceRuleError('AMOUNT_BELOW_MINIMUM', `The smallest investment is ${inrText(MIN_BUY_RUPEES)}.`);
  }
  if (amount.gt(state.cash)) {
    throw new FinanceRuleError('INSUFFICIENT_CASH', `You only have ${inrText(state.cash)} cash left.`);
  }
  return unitsForAmount(amount, nav);
}

/** Checks a SELL against the current ledger state. Returns the rupees that would be credited. */
export function checkSell(state: LedgerState, schemeCode: number, units: Dec, nav: Dec): Dec {
  const proceeds = proceedsForUnits(units, nav);
  const held = state.positions.get(schemeCode)?.units ?? new Dec(0);
  if (units.gt(held)) {
    throw new FinanceRuleError('INSUFFICIENT_UNITS', `You only own ${held.toFixed(UNIT_DP)} units of this fund.`);
  }
  if (proceeds.lte(0)) {
    throw new FinanceRuleError('INVALID_UNITS', 'That is too few units to be worth even one paisa.');
  }
  return proceeds;
}

export interface HoldingValuation {
  schemeCode: number;
  units: Dec;
  costBasis: Dec;
  nav: Dec;
  navDate: string;
  value: Dec;
  gain: Dec;
  /** null when cost basis is zero (can't happen for a real position, kept for safety). */
  returnPct: Dec | null;
}

export interface PortfolioValuation {
  startingCorpus: Dec;
  cash: Dec;
  invested: Dec;
  holdingsValue: Dec;
  totalValue: Dec;
  gain: Dec;
  returnPct: Dec;
  holdings: HoldingValuation[];
}

export interface NavQuote {
  nav: Dec;
  navDate: string;
}

export function valuePortfolio(
  startingCorpus: Dec,
  state: LedgerState,
  navs: ReadonlyMap<number, NavQuote>,
): PortfolioValuation {
  if (startingCorpus.lte(0)) throw new FinanceRuleError('INVALID_AMOUNT', 'Starting corpus must be positive.');

  const holdings: HoldingValuation[] = [];
  for (const pos of state.positions.values()) {
    const quote = navs.get(pos.schemeCode);
    if (!quote) throw new FinanceRuleError('INVALID_NAV', `No NAV available to value scheme ${pos.schemeCode}.`);
    assertPositiveNav(quote.nav);
    const value = pos.units.mul(quote.nav);
    const gain = value.minus(pos.costBasis);
    holdings.push({
      schemeCode: pos.schemeCode,
      units: pos.units,
      costBasis: pos.costBasis,
      nav: quote.nav,
      navDate: quote.navDate,
      value,
      gain,
      returnPct: pos.costBasis.isZero() ? null : gain.div(pos.costBasis).mul(100),
    });
  }
  holdings.sort((a, b) => b.value.comparedTo(a.value));

  const holdingsValue = holdings.reduce((sum, h) => sum.plus(h.value), new Dec(0));
  const invested = holdings.reduce((sum, h) => sum.plus(h.costBasis), new Dec(0));
  const totalValue = state.cash.plus(holdingsValue);
  const gain = totalValue.minus(startingCorpus);
  return {
    startingCorpus,
    cash: state.cash,
    invested,
    holdingsValue,
    totalValue,
    gain,
    returnPct: gain.div(startingCorpus).mul(100),
    holdings,
  };
}
