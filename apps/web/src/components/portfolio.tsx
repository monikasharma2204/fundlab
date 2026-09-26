import { Link } from 'react-router-dom';
import type { Holding, Nudge, Trade } from '../lib/types';
import { dateTime, inr, navDate, pct, tone } from '../lib/format';
import { Badge, Empty } from './ui';

export function HoldingsTable({ holdings, linkFunds = false }: { holdings: Holding[]; linkFunds?: boolean }) {
  if (holdings.length === 0) return <Empty title="No funds yet">All the money is still cash.</Empty>;
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-2 font-medium">Fund</th>
            <th className="px-3 py-2 text-right font-medium">Units</th>
            <th className="px-3 py-2 text-right font-medium">Put in</th>
            <th className="px-3 py-2 text-right font-medium">Worth now</th>
            <th className="px-3 py-2 text-right font-medium">Change</th>
            <th className="px-5 py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.schemeCode} className="border-b border-line/60 last:border-0">
              <td className="px-5 py-3">
                {linkFunds ? (
                  <Link to={`/student/funds/${h.schemeCode}`} className="font-medium hover:underline">
                    {h.schemeName}
                  </Link>
                ) : (
                  <span className="font-medium">{h.schemeName}</span>
                )}
                <div className="text-xs text-muted">
                  {h.category} · NAV {inr(h.nav, true)} on {navDate(h.navDate)}
                </div>
              </td>
              <td className="num px-3 py-3 text-right">{h.units}</td>
              <td className="num px-3 py-3 text-right">{inr(h.costBasis)}</td>
              <td className="num px-3 py-3 text-right font-medium">{inr(h.value)}</td>
              <td className={`num px-3 py-3 text-right ${tone(h.returnPct)}`}>{pct(h.returnPct)}</td>
              <td className="num px-5 py-3 text-right text-muted">{h.share}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TradeList({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return <Empty title="No decisions yet">Buys and sells will appear here with the reasons behind them.</Empty>;
  return (
    <ol className="space-y-3">
      {trades.map((t) => (
        <li key={t.id} className="rounded-xl border border-line bg-white/60 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <Badge tone={t.type === 'BUY' ? 'accent' : 'neutral'}>{t.type === 'BUY' ? 'Bought' : 'Sold'}</Badge>{' '}
              <span className="font-medium">{t.schemeName}</span>
            </div>
            <div className="text-xs text-muted">{dateTime(t.createdAt)}</div>
          </div>
          <div className="num mt-1.5 text-sm text-muted">
            {inr(t.amount, true)} · {t.units} units at NAV {inr(t.navUsed, true)} (published {navDate(t.navDate)})
          </div>
          {t.reason ? (
            <blockquote className="mt-2 border-l-2 border-accent/40 pl-3 text-sm italic">“{t.reason}”</blockquote>
          ) : (
            <div className="mt-2 text-sm text-muted">No reason given.</div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function NudgeBadges({ nudges }: { nudges: Nudge[] }) {
  if (nudges.length === 0) return <span className="text-sm text-muted">—</span>;
  const short: Record<Nudge['code'], string> = {
    NOT_STARTED: 'Not started',
    CONCENTRATED: 'All eggs, one basket',
    THIN_REASONING: 'Thin reasons',
    IDLE_CASH: 'Mostly cash',
    CHURNING: 'Lots of switching',
  };
  return (
    <div className="flex flex-wrap gap-1">
      {nudges.map((n) => (
        <span key={n.code} title={n.message}>
          <Badge tone="warn">{short[n.code]}</Badge>
        </span>
      ))}
    </div>
  );
}
