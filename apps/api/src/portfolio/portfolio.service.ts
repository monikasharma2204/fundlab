import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Dec, money, unitsStr } from '../finance/money';
import { LedgerTrade, PortfolioValuation, replayLedger, valuePortfolio } from '../finance/portfolio';
import { Nudge, computeNudges } from '../finance/nudges';
import { NavService } from '../funds/nav.service';

type TradeRow = {
  id: string;
  type: 'BUY' | 'SELL';
  schemeCode: number;
  units: { toString(): string };
  navUsed: { toString(): string };
  navDate: Date;
  amount: { toString(): string };
  reason: string | null;
  createdAt: Date;
};

export const toLedgerTrade = (t: TradeRow): LedgerTrade => ({
  type: t.type,
  schemeCode: t.schemeCode,
  units: new Dec(t.units.toString()),
  amount: new Dec(t.amount.toString()),
});

export interface StudentPortfolio {
  valuation: PortfolioValuation;
  nudges: Nudge[];
  trades: TradeRow[];
}

/**
 * Derives portfolio state from the ledger + latest NAVs. Nothing here writes;
 * the same derivation serves the student's own view and the teacher's views.
 */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly navs: NavService,
  ) {}

  private async navMapFor(trades: TradeRow[]) {
    const quotes = await this.navs.getDisplayNavs(trades.map((t) => t.schemeCode));
    return new Map([...quotes].map(([code, q]) => [code, { nav: q.nav, navDate: q.navDate }]));
  }

  build(startingCorpus: Dec, trades: TradeRow[], navs: Map<number, { nav: Dec; navDate: string }>, now = new Date()): StudentPortfolio {
    const state = replayLedger(startingCorpus, trades.map(toLedgerTrade));
    const valuation = valuePortfolio(startingCorpus, state, navs);
    return { valuation, nudges: computeNudges(valuation, trades, now), trades };
  }

  async forStudent(studentId: string) {
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { classroom: true, trades: { orderBy: { seq: 'asc' } } },
    });
    const navs = await this.navMapFor(student.trades);
    return { student, portfolio: this.build(new Dec(student.classroom.startingCorpus.toString()), student.trades, navs) };
  }

  /** Values every student in a classroom with one DB round trip for trades and one NAV lookup per fund. */
  async forClassroom(classroomId: string) {
    const students = await this.prisma.student.findMany({
      where: { classroomId },
      include: { classroom: true, trades: { orderBy: { seq: 'asc' } } },
      orderBy: { joinedAt: 'asc' },
    });
    const navs = await this.navMapFor(students.flatMap((s) => s.trades));
    return students.map((s) => ({
      student: s,
      portfolio: this.build(new Dec(s.classroom.startingCorpus.toString()), s.trades, navs),
    }));
  }
}

/** JSON shape for a valuation. Decimals leave the server as strings so no precision is lost in transit. */
export function serializeValuation(v: PortfolioValuation, fundNames: Map<number, { schemeName: string; category: string }>) {
  return {
    startingCorpus: money(v.startingCorpus),
    cash: money(v.cash),
    invested: money(v.invested),
    holdingsValue: money(v.holdingsValue),
    totalValue: money(v.totalValue),
    gain: money(v.gain),
    returnPct: v.returnPct.toFixed(2),
    holdings: v.holdings.map((h) => ({
      schemeCode: h.schemeCode,
      schemeName: fundNames.get(h.schemeCode)?.schemeName ?? String(h.schemeCode),
      category: fundNames.get(h.schemeCode)?.category ?? '',
      units: unitsStr(h.units),
      costBasis: money(h.costBasis),
      nav: h.nav.toFixed(4),
      navDate: h.navDate,
      value: money(h.value),
      gain: money(h.gain),
      returnPct: h.returnPct ? h.returnPct.toFixed(2) : null,
      share: v.totalValue.gt(0) ? h.value.div(v.totalValue).mul(100).toFixed(1) : '0.0',
    })),
  };
}

export function serializeTrade(t: TradeRow, fundNames: Map<number, { schemeName: string }>) {
  return {
    id: t.id,
    type: t.type,
    schemeCode: t.schemeCode,
    schemeName: fundNames.get(t.schemeCode)?.schemeName ?? String(t.schemeCode),
    units: new Dec(t.units.toString()).toFixed(3),
    navUsed: new Dec(t.navUsed.toString()).toFixed(4),
    navDate: t.navDate.toISOString().slice(0, 10),
    amount: new Dec(t.amount.toString()).toFixed(2),
    reason: t.reason,
    createdAt: t.createdAt.toISOString(),
  };
}

export async function loadFundNames(prisma: PrismaService) {
  const funds = await prisma.fund.findMany({ select: { schemeCode: true, schemeName: true, category: true } });
  return new Map(funds.map((f) => [f.schemeCode, f]));
}
