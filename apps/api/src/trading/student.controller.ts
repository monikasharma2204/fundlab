import { Body, Controller, Get, Post } from '@nestjs/common';
import type { z } from 'zod';
import { ZodPipe } from '../common/errors';
import { PrismaService } from '../database/prisma.service';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.guard';
import { loadFundNames, PortfolioService, serializeTrade, serializeValuation } from '../portfolio/portfolio.service';
import { BuySchema, SellSchema, TradingService } from './trading.service';

/**
 * Everything a student can see or do. The student id always comes from the
 * verified token — there is no route that accepts another student's id.
 */
@Roles('STUDENT')
@Controller('me')
export class StudentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: PortfolioService,
    private readonly trading: TradingService,
  ) {}

  @Get()
  async overview(@CurrentUser() user: AuthUser) {
    const [{ student, portfolio }, names] = await Promise.all([
      this.portfolios.forStudent(user.sub),
      loadFundNames(this.prisma),
    ]);
    return {
      student: { id: student.id, displayName: student.displayName, joinedAt: student.joinedAt.toISOString() },
      classroom: { name: student.classroom.name },
      portfolio: serializeValuation(portfolio.valuation, names),
      tradeCount: portfolio.trades.length,
    };
  }

  @Get('trades')
  async trades(@CurrentUser() user: AuthUser) {
    const [trades, names] = await Promise.all([
      this.prisma.trade.findMany({ where: { studentId: user.sub }, orderBy: { seq: 'desc' } }),
      loadFundNames(this.prisma),
    ]);
    return trades.map((t) => serializeTrade(t, names));
  }

  @Post('buy')
  async buy(@CurrentUser() user: AuthUser, @Body(new ZodPipe(BuySchema)) body: z.infer<typeof BuySchema>) {
    const trade = await this.trading.buy(user.sub, body);
    return serializeTrade(trade, await loadFundNames(this.prisma));
  }

  @Post('sell')
  async sell(@CurrentUser() user: AuthUser, @Body(new ZodPipe(SellSchema)) body: z.infer<typeof SellSchema>) {
    const trade = await this.trading.sell(user.sub, body);
    return serializeTrade(trade, await loadFundNames(this.prisma));
  }
}
