import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorBox, H1, Input, Loading } from '../../components/ui';
import { inr, navDate, pct, RISK_LABEL, tone } from '../../lib/format';
import type { FundListItem } from '../../lib/types';
import { useApi } from '../../lib/useApi';

const CATEGORY_ORDER = ['Index', 'Large cap', 'Flexi cap', 'Mid cap', 'Small cap', 'Hybrid', 'Debt', 'Liquid', 'Gold'];

export function Explore() {
  const { data, error, loading, reload } = useApi<FundListItem[]>('/funds');
  const [category, setCategory] = useState<string>('All');
  const [query, setQuery] = useState('');

  if (loading && !data) return <Loading label="Fetching the latest published NAVs…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const funds = data!;
  const categories = CATEGORY_ORDER.filter((c) => funds.some((f) => f.category === c));
  // Every word typed must appear somewhere in the fund's name, fund house, category or description.
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (f: FundListItem) => {
    const text = `${f.schemeName} ${f.fundHouse} ${f.category} ${f.blurb}`.toLowerCase();
    return words.every((w) => text.includes(w));
  };
  const shown = funds.filter((f) => (category === 'All' || f.category === category) && matches(f));
  const grouped = categories
    .map((c) => ({ c, items: shown.filter((f) => f.category === c) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <H1 sub="16 real Indian mutual funds, picked so you can compare different kinds of risk. All are Direct plans, Growth option.">
        Explore funds
      </H1>
      <div className="relative mb-4 max-w-xl">
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden>
          <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M13 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <Input
          type="search"
          aria-label="Search funds"
          placeholder="Search by fund name, fund house or type — e.g. “nifty”, “HDFC”, “gold”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>
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

      {grouped.length === 0 && (
        <Empty title="No funds match your search">
          Try a shorter word, or{' '}
          <button
            className="font-medium text-accent underline"
            onClick={() => {
              setQuery('');
              setCategory('All');
            }}
          >
            show all funds
          </button>
          .
        </Empty>
      )}
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
