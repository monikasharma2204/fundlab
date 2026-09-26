import { HttpStatus, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { generatePin, PinAttemptLimiter } from '../auth/auth.service';
import { AppError, isUniqueViolation, notFound } from '../common/errors';
import { PrismaService } from '../database/prisma.service';
import { Dec, money } from '../finance/money';
import { loadFundNames, PortfolioService, serializeTrade, serializeValuation } from '../portfolio/portfolio.service';

export const CreateClassroomSchema = z.object({
  name: z.string().trim().min(3, 'Class name must be at least 3 characters').max(80),
  startingCorpus: z.coerce
    .number()
    .int('Use a whole number of rupees')
    .min(1_000, 'Starting money must be at least ₹1,000')
    .max(1_00_00_000, 'Starting money must be at most ₹1,00,00,000'),
});

// No 0/O/1/I/L — class codes get read aloud and written on a whiteboard.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function newJoinCode(): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

function median(values: Dec[]): Dec | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : sorted[mid - 1].plus(sorted[mid]).div(2);
}

@Injectable()
export class ClassroomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: PortfolioService,
    private readonly pinLimiter: PinAttemptLimiter,
  ) {}

  /**
   * Ownership check for every teacher route. A classroom that belongs to another
   * teacher answers 404, not 403, so ids can't be probed for existence.
   */
  private async owned(teacherId: string, classroomId: string) {
    const parsed = z.uuid().safeParse(classroomId);
    const classroom = parsed.success ? await this.prisma.classroom.findUnique({ where: { id: classroomId } }) : null;
    if (!classroom || classroom.teacherId !== teacherId) throw notFound('Classroom');
    return classroom;
  }

  private async ownedStudent(teacherId: string, classroomId: string, studentId: string) {
    await this.owned(teacherId, classroomId);
    const parsed = z.uuid().safeParse(studentId);
    const student = parsed.success ? await this.prisma.student.findUnique({ where: { id: studentId } }) : null;
    if (!student || student.classroomId !== classroomId) throw notFound('Student');
    return student;
  }

  async create(teacherId: string, input: z.infer<typeof CreateClassroomSchema>) {
    // 31^6 ≈ 887M codes, so a collision is rare; the unique index catches it and we retry.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const c = await this.prisma.classroom.create({
          data: { teacherId, name: input.name, joinCode: newJoinCode(), startingCorpus: input.startingCorpus.toFixed(2) },
        });
        return { id: c.id, name: c.name, joinCode: c.joinCode, startingCorpus: money(new Dec(c.startingCorpus.toString())) };
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, 'CODE_EXHAUSTED', 'Could not generate a class code. Try again.');
  }

  async list(teacherId: string) {
    const rows = await this.prisma.classroom.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { students: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      joinCode: c.joinCode,
      startingCorpus: money(new Dec(c.startingCorpus.toString())),
      studentCount: c._count.students,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async dashboard(teacherId: string, classroomId: string) {
    const classroom = await this.owned(teacherId, classroomId);
    const rows = await this.portfolios.forClassroom(classroomId);

    const entries = rows.map(({ student, portfolio }) => {
      const { valuation, nudges, trades } = portfolio;
      const started = trades.some((t) => t.type === 'BUY');
      return {
        studentId: student.id,
        displayName: student.displayName,
        joinedAt: student.joinedAt.toISOString(),
        started,
        totalValue: valuation.totalValue,
        returnPct: valuation.returnPct,
        gain: valuation.gain,
        cashShare: valuation.totalValue.gt(0) ? valuation.cash.div(valuation.totalValue).mul(100) : new Dec(0),
        fundsHeld: valuation.holdings.length,
        tradeCount: trades.length,
        lastActivityAt: trades.length ? trades[trades.length - 1].createdAt.toISOString() : null,
        nudges,
      };
    });

    // Only students who have invested are ranked. Otherwise sitting on 100% cash
    // (0.00%) would outrank anyone who took a sensible position and is down a little.
    const ranked = entries
      .filter((e) => e.started)
      .sort((a, b) => b.returnPct.comparedTo(a.returnPct) || a.displayName.localeCompare(b.displayName));
    const notStarted = entries.filter((e) => !e.started).sort((a, b) => a.displayName.localeCompare(b.displayName));
    const returns = ranked.map((e) => e.returnPct);
    const avg = returns.length ? returns.reduce((s, r) => s.plus(r), new Dec(0)).div(returns.length) : null;

    return {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        joinCode: classroom.joinCode,
        startingCorpus: money(new Dec(classroom.startingCorpus.toString())),
      },
      stats: {
        students: entries.length,
        investedStudents: ranked.length,
        averageReturnPct: avg ? avg.toFixed(2) : null,
        medianReturnPct: median(returns)?.toFixed(2) ?? null,
        needsNudge: entries.filter((e) => e.nudges.length > 0).length,
      },
      leaderboard: [...ranked, ...notStarted].map((e) => ({
        rank: e.started ? ranked.indexOf(e) + 1 : null,
        studentId: e.studentId,
        displayName: e.displayName,
        joinedAt: e.joinedAt,
        started: e.started,
        totalValue: money(e.totalValue),
        gain: money(e.gain),
        returnPct: e.returnPct.toFixed(2),
        cashSharePct: e.cashShare.toFixed(1),
        fundsHeld: e.fundsHeld,
        tradeCount: e.tradeCount,
        lastActivityAt: e.lastActivityAt,
        nudges: e.nudges,
      })),
    };
  }

  async studentDetail(teacherId: string, classroomId: string, studentId: string) {
    await this.ownedStudent(teacherId, classroomId, studentId);
    const [{ student, portfolio }, names] = await Promise.all([
      this.portfolios.forStudent(studentId),
      loadFundNames(this.prisma),
    ]);
    return {
      student: { id: student.id, displayName: student.displayName, joinedAt: student.joinedAt.toISOString() },
      classroom: { id: student.classroom.id, name: student.classroom.name },
      portfolio: serializeValuation(portfolio.valuation, names),
      nudges: portfolio.nudges,
      trades: [...portfolio.trades].reverse().map((t) => serializeTrade(t, names)),
    };
  }

  /**
   * A student who lost their PIN can't recover it alone (no email), so the teacher issues a new one.
   * This also signs the student out everywhere (tokenVersion++) — if the PIN leaked, whoever used
   * it is logged out too — and lifts any wrong-PIN lockout.
   */
  async resetPin(teacherId: string, classroomId: string, studentId: string) {
    const student = await this.ownedStudent(teacherId, classroomId, studentId);
    const classroom = await this.owned(teacherId, classroomId);
    const pin = generatePin();
    await this.prisma.student.update({
      where: { id: studentId },
      data: { pinHash: await bcrypt.hash(pin, 10), tokenVersion: { increment: 1 } },
    });
    this.pinLimiter.clear(PinAttemptLimiter.key(classroom.joinCode, student.nameKey));
    return { pin };
  }
}
