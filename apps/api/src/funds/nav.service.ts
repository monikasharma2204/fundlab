import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../common/errors';
import { PrismaService } from '../database/prisma.service';
import { Dec } from '../finance/money';
import { NavPoint, isNavStale, todayInIndia } from '../finance/nav';
import { FUND_DATA_PROVIDER, FundDataProvider, FundDataUnavailableError } from './fund-data.provider';

/** How long a fetched NAV is reused before asking the provider again. NAVs publish once a day. */
export const NAV_REFRESH_MS = 30 * 60_000;
const HISTORY_TTL_MS = 6 * 60 * 60_000;

export interface NavQuoteInfo {
  schemeCode: number;
  nav: Dec;
  navDate: string;
  /** True when the NAV date is too old to trade on (see MAX_NAV_AGE_DAYS). */
  stale: boolean;
}

export class NavUnavailableError extends AppError {
  constructor(message = 'Fund data is temporarily unavailable. No investment has been recorded.') {
    super(HttpStatus.SERVICE_UNAVAILABLE, 'NAV_UNAVAILABLE', message);
  }
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * All NAV reads go through here. Two policies:
 *  - getTradableNav: fail CLOSED. A trade needs a fresh, successfully fetched, non-stale NAV.
 *  - getDisplayNavs: best effort. Browsing and valuation may fall back to the last cached NAV
 *    (the date is always shown next to it, so nothing pretends to be live).
 */
@Injectable()
export class NavService {
  private readonly logger = new Logger(NavService.name);
  private readonly inflight = new Map<number, Promise<NavQuoteInfo>>();
  private readonly history = new Map<number, { at: number; points: NavPoint[] }>();
  private readonly historyInflight = new Map<number, Promise<NavPoint[]>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FUND_DATA_PROVIDER) private readonly provider: FundDataProvider,
  ) {}

  private async cached(schemeCode: number) {
    return this.prisma.navPrice.findFirst({ where: { schemeCode }, orderBy: { navDate: 'desc' } });
  }

  private toQuote(row: { schemeCode: number; nav: { toString(): string }; navDate: Date }): NavQuoteInfo {
    const navDate = isoOf(row.navDate);
    return { schemeCode: row.schemeCode, nav: new Dec(row.nav.toString()), navDate, stale: isNavStale(navDate, todayInIndia()) };
  }

  /** Fetches from the provider and stores it. De-duplicates concurrent refreshes of the same fund. */
  private refresh(schemeCode: number): Promise<NavQuoteInfo> {
    const existing = this.inflight.get(schemeCode);
    if (existing) return existing;
    const p = (async () => {
      const latest = await this.provider.getLatestNav(schemeCode);
      const navDate = new Date(`${latest.navDate}T00:00:00Z`);
      const nav = latest.nav.toFixed(4);
      const row = await this.prisma.navPrice.upsert({
        where: { schemeCode_navDate: { schemeCode, navDate } },
        create: { schemeCode, navDate, nav },
        update: { nav, fetchedAt: new Date() },
      });
      return this.toQuote(row);
    })().finally(() => this.inflight.delete(schemeCode));
    this.inflight.set(schemeCode, p);
    return p;
  }

  async getTradableNav(schemeCode: number): Promise<NavQuoteInfo> {
    const cached = await this.cached(schemeCode);
    let quote: NavQuoteInfo;
    if (cached && Date.now() - cached.fetchedAt.getTime() < NAV_REFRESH_MS) {
      quote = this.toQuote(cached);
    } else {
      try {
        quote = await this.refresh(schemeCode);
      } catch (err) {
        // Deliberately no fallback to an old cached NAV here: that is exactly how stale prices get traded.
        this.logger.warn(`Blocking trade on ${schemeCode}: ${(err as Error).message}`);
        throw new NavUnavailableError();
      }
    }
    if (quote.stale) {
      throw new NavUnavailableError(
        `The latest NAV for this fund is from ${quote.navDate}, which is too old to trade on. No investment has been recorded.`,
      );
    }
    return quote;
  }

  async getDisplayNav(schemeCode: number): Promise<NavQuoteInfo | null> {
    const cached = await this.cached(schemeCode);
    if (cached && Date.now() - cached.fetchedAt.getTime() < NAV_REFRESH_MS) return this.toQuote(cached);
    try {
      return await this.refresh(schemeCode);
    } catch (err) {
      if (!(err instanceof FundDataUnavailableError)) this.logger.error(err);
      return cached ? this.toQuote(cached) : null;
    }
  }

  async getDisplayNavs(schemeCodes: Iterable<number>): Promise<Map<number, NavQuoteInfo>> {
    const codes = [...new Set(schemeCodes)];
    const quotes = await Promise.all(codes.map((c) => this.getDisplayNav(c)));
    const map = new Map<number, NavQuoteInfo>();
    quotes.forEach((q, i) => q && map.set(codes[i], q));
    return map;
  }

  /** Full NAV history, oldest first. Cached in memory; returns [] if the provider is down. */
  async getHistory(schemeCode: number): Promise<NavPoint[]> {
    const hit = this.history.get(schemeCode);
    if (hit && Date.now() - hit.at < HISTORY_TTL_MS) return hit.points;
    const pending = this.historyInflight.get(schemeCode);
    if (pending) return pending;
    const p = this.provider
      .getHistory(schemeCode)
      .then((points) => {
        this.history.set(schemeCode, { at: Date.now(), points });
        return points;
      })
      .catch((err) => {
        this.logger.warn(`History unavailable for ${schemeCode}: ${(err as Error).message}`);
        return hit?.points ?? [];
      })
      .finally(() => this.historyInflight.delete(schemeCode));
    this.historyInflight.set(schemeCode, p);
    return p;
  }
}
