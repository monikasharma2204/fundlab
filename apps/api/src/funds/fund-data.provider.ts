/**
 * The boundary between FundLab and whoever publishes NAVs. The rest of the app
 * only ever sees these shapes; provider-specific JSON stays inside the adapter.
 */
import type { Dec } from '../finance/money';

export interface ProviderNav {
  schemeCode: number;
  schemeName: string;
  navDate: string; // YYYY-MM-DD
  nav: Dec;
}

export interface ProviderNavPoint {
  date: string; // YYYY-MM-DD
  nav: Dec;
}

export interface FundDataProvider {
  /** Latest published NAV. Must throw FundDataUnavailableError rather than return anything doubtful. */
  getLatestNav(schemeCode: number): Promise<ProviderNav>;
  /** Full published history, oldest first. */
  getHistory(schemeCode: number): Promise<ProviderNavPoint[]>;
}

export const FUND_DATA_PROVIDER = Symbol('FUND_DATA_PROVIDER');

export class FundDataUnavailableError extends Error {
  constructor(
    readonly schemeCode: number,
    readonly reason: string,
  ) {
    super(`Fund data unavailable for ${schemeCode}: ${reason}`);
  }
}
