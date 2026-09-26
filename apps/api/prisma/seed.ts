/**
 * Seeds the curated funds (verified against the live provider) and one demo
 * classroom whose trades are backdated using REAL historical NAVs, so the demo
 * shows genuine market movement rather than invented numbers.
 *
 * Idempotent: funds are upserted; the demo classroom is only created once.
 * To start over, run `npm run db:reset` (drops the schema — the ledger
 * trigger intentionally prevents deleting trades any other way).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { PrismaClient } from '../src/generated/prisma/client';
import { MfapiProvider } from '../src/funds/mfapi.provider';
import { Dec } from '../src/finance/money';
import { isNavStale, NavPoint, todayInIndia } from '../src/finance/nav';
import { LedgerTrade, checkBuy, checkSell, replayLedger } from '../src/finance/portfolio';
import { CURATED_FUNDS } from './funds';
import { nameKeyOf } from '../src/auth/auth.service';

neonConfig.webSocketConstructor = ws;

export const DEMO = {
  teacherEmail: 'demo.teacher@fundlab.app',
  teacherPassword: 'fundlab-demo',
  joinCode: 'BLUE42',
  studentPin: '246810',
  corpus: 100000,
};

type Plan = { daysAgo: number; code: number } & ({ buy: number; reason: string } | { sellAll: true; reason?: string });

// Each demo student illustrates one situation a teacher should be able to spot.
const STUDENTS: Array<{ name: string; joinedDaysAgo: number; plan: Plan[] }> = [
  {
    name: 'Riya', // diversified, clear reasoning → no nudge
    joinedDaysAgo: 60,
    plan: [
      { daysAgo: 58, code: 120716, buy: 30000, reason: 'An index fund of the top 50 companies is a cheap, steady base for my money' },
      { daysAgo: 45, code: 122639, buy: 25000, reason: 'Flexi cap lets the manager also buy foreign companies, which spreads my risk' },
      { daysAgo: 40, code: 118987, buy: 20000, reason: 'Corporate bonds should stay calm if shares fall, so not everything moves together' },
      { daysAgo: 20, code: 118989, buy: 15000, reason: 'A smaller mid cap slice because I can accept bigger swings on part of the money' },
    ],
  },
  {
    name: 'Aarav', // all-in on one small cap → CONCENTRATED
    joinedDaysAgo: 55,
    plan: [{ daysAgo: 50, code: 118778, buy: 94000, reason: 'Small caps went up the most last year so I think they will keep going up' }],
  },
  {
    name: 'Meera', // balanced, sensible → no nudge
    joinedDaysAgo: 50,
    plan: [
      { daysAgo: 48, code: 118968, buy: 35000, reason: 'Balanced advantage mixes shares and bonds so the ride should be smoother' },
      { daysAgo: 47, code: 119788, buy: 15000, reason: 'Gold often moves differently from shares so it can protect me in a crash' },
      { daysAgo: 30, code: 118825, buy: 35000, reason: 'Large established companies for long-term growth without too much drama' },
    ],
  },
  {
    name: 'Kabir', // diversified, good reasons, whatever the market did → no nudge, even if negative
    joinedDaysAgo: 40,
    plan: [
      { daysAgo: 35, code: 147622, buy: 30000, reason: 'Mid caps have more room to grow and an index keeps costs low for me' },
      { daysAgo: 34, code: 125497, buy: 25000, reason: 'Small caps are risky but I am young so I can wait through the falls' },
      { daysAgo: 33, code: 143341, buy: 30000, reason: 'Next 50 companies could become the next big leaders in the market' },
    ],
  },
  {
    name: 'Dev', // copy-paste, one-word reasons → THIN_REASONING
    joinedDaysAgo: 30,
    plan: [
      { daysAgo: 28, code: 120465, buy: 30000, reason: 'good fund good fund' },
      { daysAgo: 27, code: 118955, buy: 30000, reason: 'good fund good fund' },
      { daysAgo: 12, code: 120586, buy: 30000, reason: 'looks good to me' },
    ],
  },
  {
    name: 'Zoya', // buys and dumps repeatedly → CHURNING
    joinedDaysAgo: 25,
    plan: [
      { daysAgo: 20, code: 118778, buy: 30000, reason: 'Small caps jumped this week and I want to catch the momentum early' },
      { daysAgo: 20, code: 118989, buy: 30000, reason: 'Mid caps are also rising quickly so I am adding them to ride the trend' },
      { daysAgo: 19, code: 120716, buy: 30000, reason: 'Some Nifty 50 so I have at least one big-company fund in the mix' },
      { daysAgo: 5, code: 118778, sellAll: true, reason: 'It fell for two days' },
      { daysAgo: 4, code: 118989, sellAll: true, reason: 'Scared it will fall more' },
      { daysAgo: 2, code: 120716, sellAll: true, reason: 'Want cash to buy the next rising fund' },
    ],
  },
  {
    name: 'Tara', // one small buy, rest idle → IDLE_CASH
    joinedDaysAgo: 20,
    plan: [{ daysAgo: 18, code: 119091, buy: 10000, reason: 'A liquid fund because I do not want to lose any money while I learn more' }],
  },
  { name: 'Ishaan', joinedDaysAgo: 3, plan: [] }, // joined, never invested → NOT_STARTED
];

const DAY_MS = 86_400_000;

function navOnOrBefore(history: NavPoint[], iso: string): NavPoint {
  let hit: NavPoint | undefined;
  for (const p of history) {
    if (p.date <= iso) hit = p;
    else break;
  }
  if (!hit) throw new Error(`No NAV on or before ${iso}`);
  return hit;
}

export async function seed(connectionString: string, schema = 'public', options: { demo?: boolean } = {}) {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }, { schema }) });
  const provider = new MfapiProvider();
  const today = todayInIndia();
  try {
    // 1. Funds: verify each against the live provider before trusting it.
    for (const f of CURATED_FUNDS) {
      const latest = await provider.getLatestNav(f.schemeCode);
      if (!f.expectName.test(latest.schemeName)) {
        throw new Error(`Scheme ${f.schemeCode} is now "${latest.schemeName}", expected ${f.expectName}. Update prisma/funds.ts.`);
      }
      if (isNavStale(latest.navDate, today)) {
        throw new Error(`Scheme ${f.schemeCode} last published a NAV on ${latest.navDate}. Remove or replace it.`);
      }
      const { expectName: _ignored, ...data } = f;
      await prisma.fund.upsert({ where: { schemeCode: f.schemeCode }, create: data, update: data });
      const navDate = new Date(`${latest.navDate}T00:00:00Z`);
      await prisma.navPrice.upsert({
        where: { schemeCode_navDate: { schemeCode: f.schemeCode, navDate } },
        create: { schemeCode: f.schemeCode, navDate, nav: latest.nav.toFixed(4) },
        update: { nav: latest.nav.toFixed(4), fetchedAt: new Date() },
      });
      console.log(`fund ok  ${f.schemeCode}  ${latest.navDate}  NAV ${latest.nav.toFixed(4)}  ${f.schemeName}`);
    }
    if (options.demo === false) return;

    // 2. Demo classroom.
    if (await prisma.classroom.findUnique({ where: { joinCode: DEMO.joinCode } })) {
      console.log(`demo classroom ${DEMO.joinCode} already exists — leaving it alone`);
      return;
    }
    const teacher = await prisma.teacher.upsert({
      where: { email: DEMO.teacherEmail },
      create: { email: DEMO.teacherEmail, name: 'Ms. Sharma', passwordHash: await bcrypt.hash(DEMO.teacherPassword, 10) },
      update: {},
    });
    const now = Date.now();
    const classroom = await prisma.classroom.create({
      data: {
        teacherId: teacher.id,
        name: 'Class 10B — Investment Challenge',
        joinCode: DEMO.joinCode,
        startingCorpus: DEMO.corpus.toFixed(2),
        createdAt: new Date(now - 62 * DAY_MS),
      },
    });

    const histories = new Map<number, NavPoint[]>();
    const historyFor = async (code: number) => {
      if (!histories.has(code)) histories.set(code, await provider.getHistory(code));
      return histories.get(code)!;
    };
    const pinHash = await bcrypt.hash(DEMO.studentPin, 10);
    const corpus = new Dec(DEMO.corpus);

    for (const s of STUDENTS) {
      const student = await prisma.student.create({
        data: { classroomId: classroom.id, displayName: s.name, nameKey: nameKeyOf(s.name), pinHash, joinedAt: new Date(now - s.joinedDaysAgo * DAY_MS) },
      });
      const ledger: LedgerTrade[] = [];
      for (const step of s.plan) {
        const at = new Date(now - step.daysAgo * DAY_MS);
        const quote = navOnOrBefore(await historyFor(step.code), at.toISOString().slice(0, 10));
        const state = replayLedger(corpus, ledger);
        let trade: LedgerTrade;
        if ('buy' in step) {
          const amount = new Dec(step.buy);
          trade = { type: 'BUY', schemeCode: step.code, amount, units: checkBuy(state, amount, quote.nav) };
        } else {
          const units = state.positions.get(step.code)!.units;
          trade = { type: 'SELL', schemeCode: step.code, units, amount: checkSell(state, step.code, units, quote.nav) };
        }
        ledger.push(trade);
        await prisma.trade.create({
          data: {
            studentId: student.id,
            schemeCode: step.code,
            type: trade.type,
            units: trade.units.toFixed(3),
            amount: trade.amount.toFixed(2),
            navUsed: quote.nav.toFixed(4),
            navDate: new Date(`${quote.date}T00:00:00Z`),
            reason: step.reason ?? null,
            createdAt: at,
          },
        });
      }
      console.log(`student ${s.name}: ${s.plan.length} trades`);
    }
    console.log(`\nDemo teacher: ${DEMO.teacherEmail} / ${DEMO.teacherPassword}`);
    console.log(`Demo class code: ${DEMO.joinCode}   (every demo student's PIN: ${DEMO.studentPin})`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  seed(url, process.env.DB_SCHEMA ?? 'public').catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
