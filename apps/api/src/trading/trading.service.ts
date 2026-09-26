import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AppError, notFound } from '../common/errors';
import { PrismaService, Tx } from '../database/prisma.service';
import { Dec } from '../finance/money';
import { checkBuy, checkSell, replayLedger } from '../finance/portfolio';
import { NavService } from '../funds/nav.service';
import { toLedgerTrade } from '../portfolio/portfolio.service';

/** AMFI scheme codes are positive integers of at most 6 digits. Accepts 120716 or "120716", nothing else. */
export const schemeCodeSchema = z
  .union([z.number(), z.string().regex(/^\d{1,6}$/)])
  .transform(Number)
  .pipe(z.number().int().min(1).max(999_999));
const schemeCode = schemeCodeSchema;
/**
 * The NAV date the student saw when they confirmed. If a newer NAV has been
 * published since the page loaded, the trade is refused (409) instead of silently
 * executing at a price the student never saw.
 */
const expectedNavDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
/** Money arrives as a string (preferred) or a JSON number; either way it becomes a Decimal before any maths. */
const rupees = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount in rupees, e.g. 5000 or 5000.50'))
  .refine((v) => new Dec(v).gt(0), 'Amount must be more than zero');
const units = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(/^\d+(\.\d{1,3})?$/, 'Units can have up to 3 decimal places'))
  .refine((v) => new Dec(v).gt(0), 'Units must be more than zero');

export const BuySchema = z.object({
  schemeCode,
  expectedNavDate,
  amount: rupees,
  reason: z
    .string()
    .trim()
    .min(10, 'Tell us why in at least 10 characters')
    .max(200, 'Keep your reason under 200 characters'),
});

export const SellSchema = z
  .object({
    schemeCode,
    expectedNavDate,
    units: units.optional(),
    /** Redeem every unit held. Avoids leftover "dust" units a student can't see or sell. */
    sellAll: z.boolean().optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((s) => s.sellAll === true || s.units !== undefined, { message: 'Choose how many units to sell', path: ['units'] });

// Neon round trips from far regions can be slow; give the lock+write transaction room.
const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

/**
 * The only code that writes to the ledger.
 *
 * Order of operations for every trade:
 *   1. Validate input and fund (no DB writes yet).
 *   2. Get a fresh, non-stale NAV — OUTSIDE the DB transaction, so a slow provider
 *      never holds a row lock. If this fails, nothing is written (fail closed).
 *   3. In one transaction: lock the student row, replay the ledger, check the rule,
 *      insert one immutable Trade row. Any failure rolls the whole thing back.
 */
@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly navs: NavService,
  ) {}

  /** Buying needs an active fund. Selling only needs the fund to exist, so a delisted fund never traps units. */
  private async requireFund(code: number, forBuy: boolean) {
    const fund = await this.prisma.fund.findUnique({ where: { schemeCode: code } });
    if (!fund || (forBuy && !fund.active)) throw notFound('Fund');
    return fund;
  }

  private async quoteFor(code: number, expected: string | undefined) {
    const quote = await this.navs.getTradableNav(code);
    if (expected && expected !== quote.navDate) {
      throw new AppError(
        HttpStatus.CONFLICT,
        'NAV_CHANGED',
        `A new NAV (for ${quote.navDate}) has been published since you looked. Please review the new price and confirm again.`,
      );
    }
    return quote;
  }

  private async ledgerFor(tx: Tx, studentId: string) {
    if (!(await this.prisma.lockStudent(tx, studentId))) throw notFound('Student');
    const student = await tx.student.findUniqueOrThrow({
      where: { id: studentId },
      include: { classroom: { select: { startingCorpus: true } }, trades: { orderBy: { seq: 'asc' } } },
    });
    return replayLedger(new Dec(student.classroom.startingCorpus.toString()), student.trades.map(toLedgerTrade));
  }

  async buy(studentId: string, input: z.infer<typeof BuySchema>) {
    await this.requireFund(input.schemeCode, true);
    const quote = await this.quoteFor(input.schemeCode, input.expectedNavDate);
    const amount = new Dec(input.amount);

    const trade = await this.prisma.$transaction(async (tx) => {
      const state = await this.ledgerFor(tx, studentId);
      const allotted = checkBuy(state, amount, quote.nav);
      return tx.trade.create({
        data: {
          studentId,
          schemeCode: input.schemeCode,
          type: 'BUY',
          units: allotted.toFixed(3),
          navUsed: quote.nav.toFixed(4),
          navDate: new Date(`${quote.navDate}T00:00:00Z`),
          amount: amount.toFixed(2),
          reason: input.reason,
        },
      });
    }, TX_OPTIONS);
    this.logger.log(`BUY ${trade.id} student=${studentId} scheme=${input.schemeCode} amount=${trade.amount}`);
    return trade;
  }

  async sell(studentId: string, input: z.infer<typeof SellSchema>) {
    await this.requireFund(input.schemeCode, false);
    const quote = await this.quoteFor(input.schemeCode, input.expectedNavDate);

    const trade = await this.prisma.$transaction(async (tx) => {
      const state = await this.ledgerFor(tx, studentId);
      const held = state.positions.get(input.schemeCode)?.units;
      if (input.sellAll && !held) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, 'INSUFFICIENT_UNITS', "You don't own any units of this fund.");
      }
      const qty = input.sellAll ? held! : new Dec(input.units!);
      const proceeds = checkSell(state, input.schemeCode, qty, quote.nav);
      return tx.trade.create({
        data: {
          studentId,
          schemeCode: input.schemeCode,
          type: 'SELL',
          units: qty.toFixed(3),
          navUsed: quote.nav.toFixed(4),
          navDate: new Date(`${quote.navDate}T00:00:00Z`),
          amount: proceeds.toFixed(2),
          reason: input.reason || null,
        },
      });
    }, TX_OPTIONS);
    this.logger.log(`SELL ${trade.id} student=${studentId} scheme=${input.schemeCode} units=${trade.units}`);
    return trade;
  }
}
