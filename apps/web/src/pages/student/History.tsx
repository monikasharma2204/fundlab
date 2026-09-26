import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TradeList } from '../../components/portfolio';
import { Badge, Button, Card, Empty, ErrorBox, H1, Input, Loading, Stat } from '../../components/ui';
import { dateTime, inr, navDate } from '../../lib/format';
import type { Trade } from '../../lib/types';
import { useApi } from '../../lib/useApi';

type Side = 'ALL' | 'BUY' | 'SELL';

/** "1234.56" → 123456n. The API sends exact 2-dp strings; summing whole paise keeps totals exact. */
function toPaise(amount: string): bigint {
  const [rupees, paise = ''] = amount.split('.');
  return BigInt(rupees) * 100n + BigInt((paise + '00').slice(0, 2));
}
const paiseToRupees = (p: bigint) => (Number(p) / 100).toFixed(2);

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function downloadCsv(trades: Trade[]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ['date_time', 'type', 'scheme_code', 'fund', 'units', 'nav_used', 'nav_date', 'amount_inr', 'reason'];
  const rows = trades.map((t) =>
    [t.createdAt, t.type, String(t.schemeCode), t.schemeName, t.units, t.navUsed, t.navDate, t.amount, t.reason ?? ''].map(esc).join(','),
  );
  const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fundlab-history.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function History() {
  const { data, error, loading, reload } = useApi<Trade[]>('/me/trades');
  const [side, setSide] = useState<Side>('ALL');
  const [fund, setFund] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  const trades = data ?? [];
  const funds = useMemo(() => {
    const byCode = new Map<number, string>();
    for (const t of trades) byCode.set(t.schemeCode, t.schemeName);
    return [...byCode].sort((a, b) => a[1].localeCompare(b[1]));
  }, [trades]);

  const totals = useMemo(() => {
    let bought = 0n;
    let sold = 0n;
    let buys = 0;
    for (const t of trades) {
      if (t.type === 'BUY') {
        bought += toPaise(t.amount);
        buys += 1;
      } else sold += toPaise(t.amount);
    }
    return { bought, sold, buys, sells: trades.length - buys };
  }, [trades]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = trades.filter(
    (t) =>
      (side === 'ALL' || t.type === side) &&
      (fund === 'ALL' || String(t.schemeCode) === fund) &&
      words.every((w) => `${t.schemeName} ${t.reason ?? ''}`.toLowerCase().includes(w)),
  );

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  if (trades.length === 0) {
    return (
      <>
        <H1 sub="Every buy and sell you make will be listed here, with the price and your reason.">Buy &amp; sell history</H1>
        <Empty title="No trades yet">
          <Link to="/student/funds" className="font-medium text-accent underline">
            Explore funds
          </Link>{' '}
          to make your first investment.
        </Empty>
      </>
    );
  }

  let lastMonth = '';

  return (
    <>
      <H1 sub="Every buy and sell, the NAV it used, and why you made it. Trades can't be edited or deleted — that's what makes them worth looking back on.">
        Buy &amp; sell history
      </H1>

      <Card className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Total bought" value={inr(paiseToRupees(totals.bought), true)} hint={`${totals.buys} buy${totals.buys === 1 ? '' : 's'}`} />
        <Stat label="Total sold" value={inr(paiseToRupees(totals.sold), true)} hint={`${totals.sells} sell${totals.sells === 1 ? '' : 's'}`} />
        <Stat label="Trades" value={trades.length} />
        <Stat label="Funds traded" value={funds.length} />
      </Card>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="grid grid-cols-3 rounded-xl bg-card p-1 text-sm ring-1 ring-line" role="tablist" aria-label="Trade type">
          {(['ALL', 'BUY', 'SELL'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={side === s}
              onClick={() => setSide(s)}
              className={`rounded-lg px-4 py-1.5 font-medium ${side === s ? 'bg-ink text-paper' : 'text-muted hover:text-ink'}`}
            >
              {s === 'ALL' ? 'All' : s === 'BUY' ? 'Buys' : 'Sells'}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by fund"
          value={fund}
          onChange={(e) => setFund(e.target.value)}
          className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="ALL">All funds</option>
          {funds.map(([code, name]) => (
            <option key={code} value={String(code)}>
              {name}
            </option>
          ))}
        </select>
        <div className="min-w-[200px] flex-1">
          <Input type="search" aria-label="Search history" placeholder="Search fund or reason" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="ghost" onClick={() => downloadCsv(shown)} disabled={shown.length === 0}>
          Download CSV
        </Button>
      </div>
      <p className="mt-3 text-sm text-muted">
        Showing {shown.length} of {trades.length} trades
      </p>

      {shown.length === 0 ? (
        <div className="mt-4">
          <Empty title="Nothing matches these filters" />
        </div>
      ) : (
        <>
          {/* Phones: cards */}
          <div className="mt-4 md:hidden">
            <TradeList trades={shown} />
          </div>

          {/* Wider screens: table grouped by month */}
          <Card className="mt-4 hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Fund</th>
                  <th className="px-3 py-3 text-right font-medium">Units</th>
                  <th className="px-3 py-3 text-right font-medium">NAV used</th>
                  <th className="px-3 py-3 text-right font-medium">Cash</th>
                  <th className="px-5 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {shown.flatMap((t) => {
                  const month = monthLabel(t.createdAt);
                  const header =
                    month !== lastMonth ? (
                      <tr key={`m-${month}`} className="bg-paper/70">
                        <td colSpan={7} className="px-5 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
                          {month}
                        </td>
                      </tr>
                    ) : null;
                  lastMonth = month;
                  const row = (
                    <tr key={t.id} className="border-b border-line/60 align-top last:border-0">
                      <td className="px-5 py-3 whitespace-nowrap text-muted">{dateTime(t.createdAt)}</td>
                      <td className="px-3 py-3">
                        <Badge tone={t.type === 'BUY' ? 'accent' : 'neutral'}>{t.type === 'BUY' ? 'Bought' : 'Sold'}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <Link to={`/student/funds/${t.schemeCode}`} className="font-medium hover:underline">
                          {t.schemeName}
                        </Link>
                      </td>
                      <td className="num px-3 py-3 text-right">{t.units}</td>
                      <td className="num px-3 py-3 text-right">
                        {inr(t.navUsed, true)}
                        <div className="text-xs text-muted">for {navDate(t.navDate)}</div>
                      </td>
                      {/* From the cash point of view: a buy spends cash, a sell brings it back. */}
                      <td className={`num px-3 py-3 text-right font-medium whitespace-nowrap ${t.type === 'SELL' ? 'text-gain' : ''}`}>
                        {t.type === 'BUY' ? '−' : '+'}
                        {inr(t.amount, true)}
                      </td>
                      <td className="max-w-xs px-5 py-3">
                        {t.reason ? <span className="italic">“{t.reason}”</span> : <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  );
                  return header ? [header, row] : [row];
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
