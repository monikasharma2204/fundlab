import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { AppError, ZodPipe, notFound } from '../common/errors';
import { PrismaService } from '../database/prisma.service';
import { NavPoint, annualisedReturnPct, shiftMonths, trailingReturnPct } from '../finance/nav';
import { schemeCodeSchema } from '../trading/trading.service';
import { NavService } from './nav.service';

const RANGES = { '1M': 1, '6M': 6, '1Y': 12, '3Y': 36, '5Y': 60 } as const;
const HistoryQuery = z.object({ range: z.enum(['1M', '6M', '1Y', '3Y', '5Y']).default('1Y') });
const MAX_CHART_POINTS = 260;

const pct = (v: { toFixed(dp: number): string } | null) => (v ? v.toFixed(2) : null);

function downsample(points: NavPoint[], max: number): NavPoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Read-only fund data. Open to any logged-in teacher or student. */
@Controller('funds')
export class FundsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly navs: NavService,
  ) {}

  @Get()
  async list() {
    const funds = await this.prisma.fund.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { schemeName: 'asc' }] });
    const quotes = await this.navs.getDisplayNavs(funds.map((f) => f.schemeCode));
    const histories = await Promise.all(funds.map((f) => this.navs.getHistory(f.schemeCode)));
    return funds.map((f, i) => {
      const q = quotes.get(f.schemeCode);
      return {
        schemeCode: f.schemeCode,
        schemeName: f.schemeName,
        fundHouse: f.fundHouse,
        category: f.category,
        blurb: f.blurb,
        riskLevel: f.riskLevel,
        nav: q ? q.nav.toFixed(4) : null,
        navDate: q?.navDate ?? null,
        navStale: q ? q.stale : true,
        return1y: pct(trailingReturnPct(histories[i], 12)),
      };
    });
  }

  @Get(':code')
  async detail(@Param('code', new ZodPipe(schemeCodeSchema)) code: number) {
    // Inactive funds are hidden from the list but still viewable, so anyone holding one can sell it.
    const fund = await this.prisma.fund.findUnique({ where: { schemeCode: code } });
    if (!fund) throw notFound('Fund');
    const [quote, history] = await Promise.all([this.navs.getDisplayNav(code), this.navs.getHistory(code)]);
    return {
      schemeCode: fund.schemeCode,
      schemeName: fund.schemeName,
      fundHouse: fund.fundHouse,
      category: fund.category,
      blurb: fund.blurb,
      riskLevel: fund.riskLevel,
      active: fund.active,
      nav: quote ? quote.nav.toFixed(4) : null,
      navDate: quote?.navDate ?? null,
      navStale: quote ? quote.stale : true,
      // Up to 1 year: total change. Beyond 1 year: annualised (CAGR), the convention for Indian MF factsheets,
      // so a 3Y number can be compared with a 1Y number.
      returns: Object.fromEntries(
        Object.entries(RANGES).map(([label, months]) => [
          label,
          pct(months > 12 ? annualisedReturnPct(history, months) : trailingReturnPct(history, months)),
        ]),
      ),
    };
  }

  @Get(':code/history')
  async history(@Param('code', new ZodPipe(schemeCodeSchema)) code: number, @Query(new ZodPipe(HistoryQuery)) q: z.infer<typeof HistoryQuery>) {
    const fund = await this.prisma.fund.findUnique({ where: { schemeCode: code } });
    if (!fund) throw notFound('Fund');
    const all = await this.navs.getHistory(code);
    if (all.length === 0) {
      throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'NAV_UNAVAILABLE', 'NAV history is temporarily unavailable.');
    }
    const from = shiftMonths(all[all.length - 1].date, -RANGES[q.range]);
    const points = downsample(
      all.filter((p) => p.date >= from),
      MAX_CHART_POINTS,
    );
    return { range: q.range, points: points.map((p) => ({ date: p.date, nav: p.nav.toFixed(4) })) };
  }
}
