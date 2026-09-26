import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBox, H1, Loading } from '../../components/ui';
import { inr, navDate, pct, RISK_LABEL, tone } from '../../lib/format';
import type { FundListItem } from '../../lib/types';
import { useApi } from '../../lib/useApi';

const CATEGORY_ORDER = ['Index', 'Large cap', 'Flexi cap', 'Mid cap', 'Small cap', 'Hybrid', 'Debt', 'Liquid', 'Gold'];

export function Explore() {
  const { data, error, loading, reload } = useApi<FundListItem[]>('/funds');
  const [category, setCategory] = useState<string>('All');

  if (loading && !data) return <Loading label="Fetching the latest published NAVs…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const funds = data!;
  const categories = CATEGORY_ORDER.filter((c) => funds.some((f) => f.category === c));
  const shown = category === 'All' ? funds : funds.filter((f) => f.category === category);
  const grouped = categories
    .map((c) => ({ c, items: shown.filter((f) => f.category === c) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <H1 sub="16 real Indian mutual funds, picked so you can compare different kinds of risk. All are Direct plans, Growth option.">
        Explore funds
      </H1>
      <div className="mb-6 flex flex-wrap gap-2">
        {['All', ...categories].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${category === c ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-muted hover:text-ink'}`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {grouped.map(({ c, items }) => (
          <section key={c}>
            <h2 className="mb-3 font-display text-xl font-semibold">{c}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((f) => (
                <Link key={f.schemeCode} to={`/student/funds/${f.schemeCode}`} className="flex flex-col rounded-2xl border border-line bg-card p-4 transition hover:border-accent">
                  <div className="font-medium leading-snug">{f.schemeName}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {f.fundHouse} · {RISK_LABEL[f.riskLevel]}
                  </div>
                  <p className="mt-2 flex-1 text-sm text-muted">{f.blurb}</p>
                  <div className="mt-3 flex items-end justify-between border-t border-line pt-3">
                    <div>
                      <div className="num font-medium">{f.nav ? inr(f.nav, true) : 'NAV unavailable'}</div>
                      <div className={`text-xs ${f.navStale ? 'text-warn' : 'text-muted'}`}>
                        {f.navStale ? 'Old NAV — trading paused · ' : 'NAV on '}
                        {navDate(f.navDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`num font-medium ${tone(f.return1y)}`}>{pct(f.return1y)}</div>
                      <div className="text-xs text-muted">past 1 year</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted">Past returns show what already happened. They don’t tell you what will happen next.</p>
    </>
  );
}
