/**
 * API integration tests against a real Postgres (Neon) in an isolated schema,
 * with a fake fund-data provider so NAVs, outages and stale data are controllable.
 *
 * Run: npm test   (uses DATABASE_URL from apps/api/.env, schema "fundlab_test")
 */
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { createApp } from '../src/main';
import { loadConfig } from '../src/config';
import { PrismaService } from '../src/database/prisma.service';
import { Dec } from '../src/finance/money';
import { todayInIndia } from '../src/finance/nav';
import {
  FundDataProvider,
  FundDataUnavailableError,
  ProviderNav,
  ProviderNavPoint,
} from '../src/funds/fund-data.provider';
import { migrate } from '../prisma/migrate';
import { dropSchema } from '../prisma/reset';

const SCHEMA = 'fundlab_test';
const FUND_A = 900001;
const FUND_B = 900002;

class FakeProvider implements FundDataProvider {
  navs = new Map<number, { nav: string; date: string }>();
  down = false;
  calls = 0;

  async getLatestNav(code: number): Promise<ProviderNav> {
    this.calls += 1;
    if (this.down) throw new FundDataUnavailableError(code, 'simulated outage');
    const n = this.navs.get(code);
    if (!n) throw new FundDataUnavailableError(code, 'unknown scheme');
    return { schemeCode: code, schemeName: `Fake ${code}`, navDate: n.date, nav: new Dec(n.nav) };
  }

  async getHistory(code: number): Promise<ProviderNavPoint[]> {
    const n = this.navs.get(code);
    return n ? [{ date: n.date, nav: new Dec(n.nav) }] : [];
  }
}

const daysAgoIso = (n: number) => {
  const d = new Date(`${todayInIndia()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe('FundLab API', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const provider = new FakeProvider();
  let http: ReturnType<typeof request>;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  /** Forces the next NAV read to go to the provider instead of the 30-minute cache. */
  const expireNavCache = () => prisma.navPrice.updateMany({ data: { fetchedAt: new Date(0) } });
  const setNav = async (code: number, nav: string, date = daysAgoIso(1)) => {
    provider.navs.set(code, { nav, date });
    await expireNavCache();
  };

  async function teacher(email: string) {
    const res = await http.post('/api/auth/teacher/signup').send({ name: 'Test Teacher', email, password: 'password123' }).expect(201);
    return res.body.token as string;
  }
  async function classroom(token: string, corpus = 100000) {
    const res = await http.post('/api/classrooms').set(auth(token)).send({ name: 'Test class', startingCorpus: corpus }).expect(201);
    return res.body as { id: string; joinCode: string };
  }
  async function student(joinCode: string, displayName: string) {
    const res = await http.post('/api/auth/student/join').send({ joinCode, displayName }).expect(201);
    return res.body as { token: string; pin: string; student: { id: string } };
  }
  const tradeCount = () => prisma.trade.count();

  beforeAll(async () => {
    const config = { ...loadConfig(), DB_SCHEMA: SCHEMA, AUTH_RATE_LIMIT: 100_000 };
    await dropSchema(config.DATABASE_URL, SCHEMA);
    await migrate(config.DATABASE_URL, SCHEMA, () => undefined);
    app = await createApp({ config, fundDataProvider: provider });
    await app.init();
    http = request(app.getHttpServer());
    prisma = app.get(PrismaService);
    for (const code of [FUND_A, FUND_B]) {
      await prisma.fund.create({
        data: { schemeCode: code, schemeName: `Fake ${code}`, fundHouse: 'Test AMC', category: 'Index', blurb: 'test', riskLevel: 'HIGH' },
      });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    provider.down = false;
    await setNav(FUND_A, '250');
    await setNav(FUND_B, '100');
  });

  describe('onboarding', () => {
    it('teacher creates a class with a 6-character code and the chosen corpus', async () => {
      const t = await teacher('onboard@test.dev');
      const c = await classroom(t, 50000);
      expect(c.joinCode).toMatch(/^[A-Z2-9]{6}$/);
      const list = await http.get('/api/classrooms').set(auth(t)).expect(200);
      expect(list.body[0]).toMatchObject({ joinCode: c.joinCode, startingCorpus: '50000.00', studentCount: 0 });
    });

    it('student joins with the class code, gets the full corpus, and can log back in with the PIN', async () => {
      const t = await teacher('join@test.dev');
      const c = await classroom(t);
      const s = await student(c.joinCode.toLowerCase(), 'Asha');
      expect(s.pin).toMatch(/^\d{6}$/);
      const me = await http.get('/api/me').set(auth(s.token)).expect(200);
      expect(me.body.portfolio).toMatchObject({ cash: '100000.00', totalValue: '100000.00', returnPct: '0.00' });

      await http.post('/api/auth/student/login').send({ joinCode: c.joinCode, displayName: 'Asha', pin: s.pin }).expect(200);
      await http
        .post('/api/auth/student/login')
        .send({ joinCode: c.joinCode, displayName: 'Asha', pin: s.pin === '000000' ? '111111' : '000000' })
        .expect(401);
    });

    it('rejects a duplicate name in the same class and an unknown code', async () => {
      const t = await teacher('dupe@test.dev');
      const c = await classroom(t);
      await student(c.joinCode, 'Kabir');
      await http.post('/api/auth/student/join').send({ joinCode: c.joinCode, displayName: 'Kabir' }).expect(409);
      await http.post('/api/auth/student/join').send({ joinCode: 'ZZZZZZ', displayName: 'Kabir' }).expect(404);
    });
  });

  describe('trading and valuation', () => {
    let token: string;
    beforeEach(async () => {
      const t = await teacher(`trade-${Date.now()}-${Math.random()}@test.dev`);
      const c = await classroom(t);
      token = (await student(c.joinCode, 'Trader')).token;
    });

    it('₹10,000 at NAV 250 buys 40 units; NAV 255 values it at ₹10,200', async () => {
      const buy = await http
        .post('/api/me/buy')
        .set(auth(token))
        .send({ schemeCode: FUND_A, amount: '10000', reason: 'Testing the index fund purchase' })
        .expect(201);
      expect(buy.body).toMatchObject({ type: 'BUY', units: '40.000', navUsed: '250.0000', amount: '10000.00' });

      await setNav(FUND_A, '255');
      const me = await http.get('/api/me').set(auth(token)).expect(200);
      expect(me.body.portfolio).toMatchObject({
        cash: '90000.00',
        holdingsValue: '10200.00',
        totalValue: '100200.00',
        gain: '200.00',
        returnPct: '0.20',
      });
    });

    it('selling 20 of 40 units at 255 credits ₹5,100 and leaves 20 units', async () => {
      await http.post('/api/me/buy').set(auth(token)).send({ schemeCode: FUND_A, amount: '10000', reason: 'Buying forty units to test' });
      await setNav(FUND_A, '255');
      const sell = await http.post('/api/me/sell').set(auth(token)).send({ schemeCode: FUND_A, units: '20' }).expect(201);
      expect(sell.body).toMatchObject({ type: 'SELL', units: '20.000', amount: '5100.00' });
      const me = await http.get('/api/me').set(auth(token)).expect(200);
      expect(me.body.portfolio.cash).toBe('95100.00');
      expect(me.body.portfolio.holdings[0]).toMatchObject({ units: '20.000', value: '5100.00' });
    });

    it('sellAll redeems every unit, including fractions, and removes the holding', async () => {
      await http.post('/api/me/buy').set(auth(token)).send({ schemeCode: FUND_B, amount: '1000', reason: 'Fractional unit purchase test' });
      await setNav(FUND_B, '3');
      await http.post('/api/me/buy').set(auth(token)).send({ schemeCode: FUND_B, amount: '1000', reason: 'A second buy at a new NAV' });
      const sell = await http.post('/api/me/sell').set(auth(token)).send({ schemeCode: FUND_B, sellAll: true }).expect(201);
      expect(sell.body.units).toBe('343.333'); // 10 + 333.333
      const me = await http.get('/api/me').set(auth(token)).expect(200);
      expect(me.body.portfolio.holdings).toHaveLength(0);
    });

    it('rejects buying more than the cash available and records nothing', async () => {
      const before = await tradeCount();
      const res = await http
        .post('/api/me/buy')
        .set(auth(token))
        .send({ schemeCode: FUND_A, amount: '100000.01', reason: 'Trying to spend more than I have' })
        .expect(422);
      expect(res.body.error.code).toBe('INSUFFICIENT_CASH');
      expect(await tradeCount()).toBe(before);
    });

    it('rejects selling more units than owned', async () => {
      await http.post('/api/me/buy').set(auth(token)).send({ schemeCode: FUND_A, amount: '10000', reason: 'Buying forty units to test' });
      const res = await http.post('/api/me/sell').set(auth(token)).send({ schemeCode: FUND_A, units: '40.001' }).expect(422);
      expect(res.body.error.code).toBe('INSUFFICIENT_UNITS');
    });

    it.each([
      ['zero amount', { amount: '0' }],
      ['negative amount', { amount: '-100' }],
      ['3 decimal amount', { amount: '100.001' }],
      ['missing reason', { reason: '' }],
      ['short reason', { reason: 'yolo' }],
    ])('rejects a buy with %s', async (_l, patch) => {
      const body = { schemeCode: FUND_A, amount: '1000', reason: 'A perfectly good reason here', ...patch };
      const res = await http.post('/api/me/buy').set(auth(token)).send(body).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('ignores any cash, NAV or student id the client tries to send', async () => {
      const res = await http
        .post('/api/me/buy')
        .set(auth(token))
        .send({ schemeCode: FUND_A, amount: '1000', reason: 'Attempting to inject a NAV', navUsed: '1', units: '9999', studentId: 'x', cash: '1e9' })
        .expect(201);
      expect(res.body).toMatchObject({ units: '4.000', navUsed: '250.0000' });
    });
  });

  describe('fail closed on bad fund data', () => {
    let token: string;
    beforeEach(async () => {
      const t = await teacher(`fail-${Date.now()}-${Math.random()}@test.dev`);
      token = (await student((await classroom(t)).joinCode, 'Nav')).token;
    });

    it('provider outage blocks the trade with 503 and writes nothing', async () => {
      await expireNavCache();
      provider.down = true;
      const before = await tradeCount();
      const res = await http
        .post('/api/me/buy')
        .set(auth(token))
        .send({ schemeCode: FUND_A, amount: '1000', reason: 'Buying while the provider is down' })
        .expect(503);
      expect(res.body.error.message).toMatch(/No investment has been recorded/);
      expect(await tradeCount()).toBe(before);
    });

    it('a stale NAV (10 days old) blocks the trade', async () => {
      await setNav(FUND_A, '250', daysAgoIso(10));
      const before = await tradeCount();
      const res = await http
        .post('/api/me/buy')
        .set(auth(token))
        .send({ schemeCode: FUND_A, amount: '1000', reason: 'Buying on a very old NAV' })
        .expect(503);
      expect(res.body.error.code).toBe('NAV_UNAVAILABLE');
      expect(await tradeCount()).toBe(before);
    });

    it('a weekend-old NAV (3 days) is still tradable, at that NAV and date', async () => {
      await setNav(FUND_A, '250', daysAgoIso(3));
      const res = await http
        .post('/api/me/buy')
        .set(auth(token))
        .send({ schemeCode: FUND_A, amount: '1000', reason: 'Buying on the Friday NAV on a Monday' })
        .expect(201);
      expect(res.body.navDate).toBe(daysAgoIso(3));
    });

    it('an unknown fund is 404 and never reaches the provider', async () => {
      const calls = provider.calls;
      await http.post('/api/me/buy').set(auth(token)).send({ schemeCode: 123, amount: '1000', reason: 'Buying a fund not on the list' }).expect(404);
      expect(provider.calls).toBe(calls);
    });
  });

  describe('concurrency', () => {
    it('two simultaneous ₹60,000 buys from ₹1,00,000 cannot both succeed', async () => {
      const t = await teacher('race@test.dev');
      const s = await student((await classroom(t)).joinCode, 'Racer');
      const buy = () =>
        http.post('/api/me/buy').set(auth(s.token)).send({ schemeCode: FUND_A, amount: '60000', reason: 'Racing another request here' });
      const results = await Promise.all([buy(), buy()]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      const me = await http.get('/api/me').set(auth(s.token)).expect(200);
      expect(me.body.portfolio.cash).toBe('40000.00');
    });
  });

  describe('authorization', () => {
    let teacherA: string;
    let teacherB: string;
    let classA: { id: string; joinCode: string };
    let classB: { id: string; joinCode: string };
    let studentA: Awaited<ReturnType<typeof student>>;
    let studentB: Awaited<ReturnType<typeof student>>;

    beforeAll(async () => {
      teacherA = await teacher('authz-a@test.dev');
      teacherB = await teacher('authz-b@test.dev');
      classA = await classroom(teacherA);
      classB = await classroom(teacherB);
      studentA = await student(classA.joinCode, 'Alpha');
      studentB = await student(classB.joinCode, 'Beta');
      await http.post('/api/me/buy').set(auth(studentB.token)).send({ schemeCode: FUND_A, amount: '1000', reason: 'Student B private trade' });
    });

    it("teacher A cannot open teacher B's classroom (404, not 403)", async () => {
      await http.get(`/api/classrooms/${classB.id}`).set(auth(teacherA)).expect(404);
    });

    it("teacher A cannot open a student from teacher B's class, even via their own class id", async () => {
      await http.get(`/api/classrooms/${classB.id}/students/${studentB.student.id}`).set(auth(teacherA)).expect(404);
      await http.get(`/api/classrooms/${classA.id}/students/${studentB.student.id}`).set(auth(teacherA)).expect(404);
      await http.post(`/api/classrooms/${classA.id}/students/${studentB.student.id}/reset-pin`).set(auth(teacherA)).expect(404);
    });

    it('a student cannot use teacher routes', async () => {
      await http.get('/api/classrooms').set(auth(studentA.token)).expect(403);
      await http.get(`/api/classrooms/${classA.id}`).set(auth(studentA.token)).expect(403);
    });

    it('a teacher cannot trade', async () => {
      await http.post('/api/me/buy').set(auth(teacherA)).send({ schemeCode: FUND_A, amount: '1000', reason: 'Teacher trying to trade' }).expect(403);
    });

    it("student A's trade list only ever contains their own trades", async () => {
      const res = await http.get('/api/me/trades').set(auth(studentA.token)).expect(200);
      expect(res.body).toEqual([]);
    });

    it('rejects missing, malformed and forged tokens', async () => {
      await http.get('/api/me').expect(401);
      await http.get('/api/me').set({ Authorization: 'Bearer not-a-jwt' }).expect(401);
      const [h, p] = studentA.token.split('.');
      const forgedPayload = Buffer.from(JSON.stringify({ sub: studentB.student.id, role: 'TEACHER' })).toString('base64url');
      await http.get('/api/classrooms').set({ Authorization: `Bearer ${h}.${forgedPayload}.${p}` }).expect(401);
    });

    it('teacher dashboard ranks invested students and lists the rest unranked', async () => {
      const res = await http.get(`/api/classrooms/${classB.id}`).set(auth(teacherB)).expect(200);
      expect(res.body.stats).toMatchObject({ students: 1, investedStudents: 1 });
      expect(res.body.leaderboard[0]).toMatchObject({ rank: 1, displayName: 'Beta' });
      const a = await http.get(`/api/classrooms/${classA.id}`).set(auth(teacherA)).expect(200);
      expect(a.body.leaderboard[0]).toMatchObject({ rank: null, started: false });
      expect(a.body.leaderboard[0].nudges[0].code).toBe('NOT_STARTED');
    });
  });

  describe('ledger integrity', () => {
    it('the database refuses to UPDATE or DELETE a trade', async () => {
      const t = await teacher('ledger@test.dev');
      const s = await student((await classroom(t)).joinCode, 'Ledger');
      const buy = await http.post('/api/me/buy').set(auth(s.token)).send({ schemeCode: FUND_A, amount: '1000', reason: 'A trade that must never change' });
      await expect(prisma.trade.update({ where: { id: buy.body.id }, data: { amount: '1' } })).rejects.toThrow(/immutable/);
      await expect(prisma.trade.delete({ where: { id: buy.body.id } })).rejects.toThrow(/immutable/);
    });

    it('the database refuses a BUY without a reason even if the app forgot to check', async () => {
      const t = await teacher('ledger2@test.dev');
      const s = await student((await classroom(t)).joinCode, 'Ledger2');
      await expect(
        prisma.trade.create({
          data: {
            studentId: s.student.id,
            schemeCode: FUND_A,
            type: 'BUY',
            units: '4',
            navUsed: '250',
            navDate: new Date(),
            amount: '1000',
            reason: '   ',
          },
        }),
      ).rejects.toThrow();
    });
  });
  describe('regressions from the review/test agents', () => {
    it('40 parallel wrong-PIN guesses: at most 5 are evaluated, the rest are locked out, and the right PIN is refused too', async () => {
      const t = await teacher('pin-race@test.dev');
      const c = await classroom(t);
      const s = await student(c.joinCode, 'Target');
      const wrong = s.pin === '000000' ? '111111' : '000000';
      const results = await Promise.all(
        Array.from({ length: 40 }, () => http.post('/api/auth/student/login').send({ joinCode: c.joinCode, displayName: 'Target', pin: wrong })),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((x) => x === 401).length).toBeLessThanOrEqual(5);
      expect(statuses.filter((x) => x === 429).length).toBeGreaterThanOrEqual(35);
      await http.post('/api/auth/student/login').send({ joinCode: c.joinCode, displayName: 'Target', pin: s.pin }).expect(429);
    });

    it('names differing only in case or spacing are the same student (409), and login ignores case', async () => {
      const t = await teacher('names@test.dev');
      const c = await classroom(t);
      const s = await student(c.joinCode, 'Kavya Rao');
      for (const dupe of ['kavya rao', 'KAVYA RAO', 'Kavya   Rao', '  kavya rao ']) {
        await http.post('/api/auth/student/join').send({ joinCode: c.joinCode, displayName: dupe }).expect(409);
      }
      await http.post('/api/auth/student/login').send({ joinCode: c.joinCode, displayName: 'kavya  RAO', pin: s.pin }).expect(200);
    });

    it('two students racing to join with the same name: one 201, one 409, never a 500', async () => {
      const t = await teacher('join-race@test.dev');
      const c = await classroom(t);
      const results = await Promise.all([0, 1, 2].map(() => http.post('/api/auth/student/join').send({ joinCode: c.joinCode, displayName: 'Twin' })));
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });

    it('teacher reset-PIN signs the student out everywhere and lifts a lockout', async () => {
      const t = await teacher('revoke@test.dev');
      const c = await classroom(t);
      const s = await student(c.joinCode, 'Leaked');
      await http.get('/api/me').set(auth(s.token)).expect(200);
      const wrong = s.pin === '000000' ? '111111' : '000000';
      for (let i = 0; i < 6; i++) await http.post('/api/auth/student/login').send({ joinCode: c.joinCode, displayName: 'Leaked', pin: wrong });
      const { body } = await http.post(`/api/classrooms/${c.id}/students/${s.student.id}/reset-pin`).set(auth(t)).expect(200);
      await http.get('/api/me').set(auth(s.token)).expect(401); // old session revoked
      await http.post('/api/auth/student/login').send({ joinCode: c.joinCode, displayName: 'Leaked', pin: body.pin }).expect(200);
    });

    it('a validly signed token for an account that no longer exists is 401 everywhere, not 500', async () => {
      const jwt = app.get(JwtService);
      const ghostStudent = await jwt.signAsync({ sub: '00000000-0000-4000-8000-000000000001', role: 'STUDENT', tv: 0 });
      const ghostTeacher = await jwt.signAsync({ sub: '00000000-0000-4000-8000-000000000002', role: 'TEACHER' });
      await http.get('/api/me').set(auth(ghostStudent)).expect(401);
      await http.get('/api/me/trades').set(auth(ghostStudent)).expect(401);
      await http.post('/api/me/buy').set(auth(ghostStudent)).send({ schemeCode: FUND_A, amount: '1000', reason: 'ghost trying to buy' }).expect(401);
      await http.post('/api/classrooms').set(auth(ghostTeacher)).send({ name: 'Ghost class', startingCorpus: 1000 }).expect(401);
    });

    it('refuses to execute at a NAV the student did not see (NAV_CHANGED), and records nothing', async () => {
      const t = await teacher('navchange@test.dev');
      const s = await student((await classroom(t)).joinCode, 'Reviewer');
      const seen = daysAgoIso(2);
      await setNav(FUND_A, '250', seen);
      await setNav(FUND_A, '260', daysAgoIso(1)); // a newer NAV is published while the page is open
      const before = await tradeCount();
      const res = await http
        .post('/api/me/buy')
        .set(auth(s.token))
        .send({ schemeCode: FUND_A, amount: '1000', reason: 'Confirmed at the price I saw', expectedNavDate: seen })
        .expect(409);
      expect(res.body.error.code).toBe('NAV_CHANGED');
      expect(await tradeCount()).toBe(before);
    });

    it('a delisted fund can still be sold, but not bought', async () => {
      const t = await teacher('delist@test.dev');
      const s = await student((await classroom(t)).joinCode, 'Holder');
      await http.post('/api/me/buy').set(auth(s.token)).send({ schemeCode: FUND_B, amount: '1000', reason: 'Buying before it is delisted' }).expect(201);
      await prisma.fund.update({ where: { schemeCode: FUND_B }, data: { active: false } });
      try {
        await http.post('/api/me/buy').set(auth(s.token)).send({ schemeCode: FUND_B, amount: '1000', reason: 'Buying after it was delisted' }).expect(404);
        await http.post('/api/me/sell').set(auth(s.token)).send({ schemeCode: FUND_B, sellAll: true }).expect(201);
      } finally {
        await prisma.fund.update({ where: { schemeCode: FUND_B }, data: { active: true } });
      }
    });

    it.each([
      ['array scheme code', { schemeCode: ['900001'] }],
      ['nested array scheme code', { schemeCode: [[900001]] }],
      ['boolean scheme code', { schemeCode: true }],
      ['huge scheme code', { schemeCode: 99999999999 }],
      ['7-digit scheme code', { schemeCode: 1234567 }],
    ])('rejects a %s with 400, not 201 or 500', async (_l, patch) => {
      const t = await teacher(`types-${Date.now()}-${Math.random()}@test.dev`);
      const s = await student((await classroom(t)).joinCode, 'Types');
      await http.post('/api/me/buy').set(auth(s.token)).send({ amount: '1000', reason: 'Checking input types', ...patch }).expect(400);
    });

    it('bad URL scheme codes are 400, not 500', async () => {
      const t = await teacher('url@test.dev');
      await http.get('/api/funds/99999999999').set(auth(t)).expect(400);
      await http.get('/api/funds/abc/history').set(auth(t)).expect(400);
    });

    it('oversized bodies get 413 and malformed JSON gets 400 — never 500 or a stack trace', async () => {
      const big = await http.post('/api/auth/teacher/login').send({ email: 'x@y.z', password: 'p'.repeat(200_000) });
      expect(big.status).toBe(413);
      const bad = await http.post('/api/auth/teacher/login').set('Content-Type', 'application/json').send('{"email": ');
      expect(bad.status).toBe(400);
      expect(JSON.stringify(bad.body)).not.toMatch(/at .*\.js|stack/i);
    });

    it('leaderboard ranks by return, keeps non-investors unranked, and computes average and median', async () => {
      const t = await teacher('board@test.dev');
      const c = await classroom(t);
      const up = await student(c.joinCode, 'Up');
      const down = await student(c.joinCode, 'Down');
      const flat = await student(c.joinCode, 'Flat');
      await student(c.joinCode, 'Idle');
      await setNav(FUND_A, '250');
      await setNav(FUND_B, '100');
      await http.post('/api/me/buy').set(auth(up.token)).send({ schemeCode: FUND_A, amount: '50000', reason: 'Half my money in fund A' }).expect(201);
      await http.post('/api/me/buy').set(auth(down.token)).send({ schemeCode: FUND_B, amount: '50000', reason: 'Half my money in fund B' }).expect(201);
      await http.post('/api/me/buy').set(auth(flat.token)).send({ schemeCode: FUND_A, amount: '100', reason: 'A tiny test amount only' }).expect(201);
      await setNav(FUND_A, '275'); // +10% → Up: +5.00%, Flat: +0.01%
      await setNav(FUND_B, '90'); //  −10% → Down: −5.00%
      const { body } = await http.get(`/api/classrooms/${c.id}`).set(auth(t)).expect(200);
      expect(body.leaderboard.map((r: { displayName: string; rank: number | null }) => [r.displayName, r.rank])).toEqual([
        ['Up', 1],
        ['Flat', 2],
        ['Down', 3],
        ['Idle', null],
      ]);
      expect(body.leaderboard.map((r: { returnPct: string }) => r.returnPct)).toEqual(['5.00', '0.01', '-5.00', '0.00']);
      expect(body.stats).toMatchObject({ students: 4, investedStudents: 3, averageReturnPct: '0.00', medianReturnPct: '0.01' });
    });
  });
});

describe('auth rate limit', () => {
  it('returns 429 once an IP exceeds AUTH_RATE_LIMIT requests a minute on /auth', async () => {
    const app = await createApp({ config: { ...loadConfig(), DB_SCHEMA: SCHEMA, AUTH_RATE_LIMIT: 3 }, fundDataProvider: new FakeProvider() });
    await app.init();
    try {
      const http = request(app.getHttpServer());
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        statuses.push((await http.post('/api/auth/student/join').send({ joinCode: 'ZZZZZZ', displayName: 'Nobody' })).status);
      }
      expect(statuses).toEqual([404, 404, 404, 429, 429]);
    } finally {
      await app.close();
    }
  });
});
