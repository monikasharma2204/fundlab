import { Link } from 'react-router-dom';
import { HoldingsTable } from '../../components/portfolio';
import { Card, ErrorBox, H2, Loading, Stat } from '../../components/ui';
import { inr, pct, signedInr, tone } from '../../lib/format';
import type { Me } from '../../lib/types';
import { useApi } from '../../lib/useApi';

// A different reflection question each day. Nothing is scored; it's a prompt to think.
const QUESTIONS = [
  'Would you rather own one fund you strongly believe in, or spread your money across several? Why?',
  'If your portfolio fell 10% next week, what would you do — and what would that tell you about your risk comfort?',
  'Two funds in the same category can end up with different returns. What might explain that?',
  'Is a fund with a NAV of ₹5,000 more “expensive” than one with a NAV of ₹30? (Hint: think about units.)',
  'Why might someone keep part of their money in a debt or liquid fund even though it grows slowly?',
  'What is the difference between a fund going down and you losing money?',
  'Did any decision you made turn out well for reasons you didn’t expect? Was it skill or luck?',
];

export function StudentHome() {
  const { data, error, loading, reload } = useApi<Me>('/me');
  if (loading && !data) return <Loading label="Valuing your portfolio at the latest NAV…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { portfolio: p, student, classroom } = data!;
  const question = QUESTIONS[Math.floor(Date.now() / 86_400_000) % QUESTIONS.length];
  const untouched = p.holdings.length === 0 && data!.tradeCount === 0;

  return (
    <>
      <p className="text-sm font-medium uppercase tracking-widest text-accent">{classroom.name}</p>
      <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {student.displayName}’s {inr(p.startingCorpus)} experiment
      </h1>
      <p className="mt-1.5 text-muted">No real money. Real funds. Real market movements. Your decisions.</p>

      <Card className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Portfolio value" value={inr(p.totalValue)} hint="cash + what your funds are worth" />
        <Stat label="Grown by" value={signedInr(p.gain, Math.abs(Number(p.gain)) < 100)} valueClass={tone(p.gain)} hint={pct(p.returnPct)} />
        <Stat label="Cash left" value={inr(p.cash)} />
        <Stat label="Invested" value={inr(p.invested)} hint={`in ${p.holdings.length} fund${p.holdings.length === 1 ? '' : 's'}`} />
      </Card>

      {untouched ? (
        <Card className="mt-6 text-center">
          <h2 className="font-display text-2xl font-semibold">Your money is all cash right now</h2>
          <p className="mx-auto mt-2 max-w-lg text-muted">
            Look through the funds, compare how they’ve behaved, and decide where to put some of it. You’ll be asked why before anything is bought.
          </p>
          <Link to="/student/funds" className="mt-5 inline-flex rounded-xl bg-accent px-5 py-2.5 font-medium text-paper hover:bg-[#184a3b]">
            Explore funds
          </Link>
        </Card>
      ) : (
        <Card className="mt-6">
          <H2 right={<Link to="/student/funds" className="text-sm font-medium text-accent hover:underline">Explore funds →</Link>}>What you own</H2>
          <HoldingsTable holdings={p.holdings} linkFunds />
          <p className="mt-4 text-xs text-muted">
            Values use each fund’s latest published NAV (shown with its date). Mutual funds publish one NAV per working day, so this doesn’t change minute to minute.
          </p>
        </Card>
      )}

      <Card className="mt-6 bg-accent-soft/50">
        <div className="text-xs font-medium uppercase tracking-wide text-accent">Today’s question</div>
        <p className="mt-1 font-display text-lg">{question}</p>
      </Card>
    </>
  );
}
