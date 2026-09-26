import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FundChart } from '../../components/FundChart';
import { Badge, Button, Card, ErrorBox, Field, H2, Input, Loading, Textarea } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { inr, navDate, pct, RISK_LABEL, tone } from '../../lib/format';
import type { FundDetail as FundDetailT, Me, Trade } from '../../lib/types';
import { useApi } from '../../lib/useApi';

const REASON_MAX = 200;
const REASON_MIN = 10;

export function FundDetail() {
  const { code } = useParams();
  const fund = useApi<FundDetailT>(`/funds/${code}`);
  const me = useApi<Me>('/me');

  if ((fund.loading && !fund.data) || (me.loading && !me.data)) return <Loading />;
  if (fund.error) return <ErrorBox error={fund.error} onRetry={fund.reload} />;
  if (me.error) return <ErrorBox error={me.error} onRetry={me.reload} />;
  const f = fund.data!;
  const holding = me.data!.portfolio.holdings.find((h) => h.schemeCode === f.schemeCode);

  return (
    <>
      <Link to="/student/funds" className="text-sm text-muted hover:text-ink">
        ← All funds
      </Link>
      <div className="mt-2 mb-6">
        <div className="flex flex-wrap gap-2">
          <Badge>{f.category}</Badge>
          <Badge>{RISK_LABEL[f.riskLevel]}</Badge>
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">{f.schemeName}</h1>
        <p className="mt-1 text-muted">{f.fundHouse}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted">Latest published NAV</div>
                <div className="num mt-1 text-3xl font-semibold">{f.nav ? inr(f.nav, true) : '—'}</div>
                <div className={`text-sm ${f.navStale ? 'text-warn' : 'text-muted'}`}>
                  {f.navStale ? 'This NAV is too old to trade on · ' : 'for '}
                  {navDate(f.navDate)}
                </div>
              </div>
              <dl className="grid grid-cols-5 gap-4 text-right">
                {(['1M', '6M', '1Y', '3Y', '5Y'] as const).map((k) => (
                  <div key={k} title={k === '3Y' || k === '5Y' ? 'Average per year (annualised)' : 'Total change over the period'}>
                    <dt className="text-xs text-muted">{k === '3Y' || k === '5Y' ? `${k} /yr` : k}</dt>
                    <dd className={`num text-sm font-medium ${tone(f.returns[k])}`}>{pct(f.returns[k])}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="mt-5">
              <FundChart schemeCode={f.schemeCode} />
            </div>
          </Card>
          <Card>
            <H2>What is this fund?</H2>
            <p>{f.blurb}</p>
            <p className="mt-3 text-sm text-muted">
              NAV (net asset value) is the price of one unit. Mutual funds publish it once per working day after markets close. A higher NAV does not mean a
              better or more expensive fund — it only changes how many units your money buys.
            </p>
          </Card>
        </div>

        <TradePanel fund={f} cash={me.data!.portfolio.cash} unitsHeld={holding?.units ?? null} onDone={me.reload} onNavChanged={fund.reload} />
      </div>
    </>
  );
}

function TradePanel({
  fund,
  cash,
  unitsHeld,
  onDone,
  onNavChanged,
}: {
  fund: FundDetailT;
  cash: string;
  unitsHeld: string | null;
  onDone: () => void;
  onNavChanged: () => void;
}) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [amount, setAmount] = useState('');
  const [units, setUnits] = useState('');
  const [sellAll, setSellAll] = useState(false);
  const [reason, setReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<Trade | null>(null);

  const nav = fund.nav ? Number(fund.nav) : null;
  const tradingBlocked = !fund.nav || fund.navStale;
  // Preview only. The server recomputes everything from its own NAV and ledger.
  const estUnits = nav && Number(amount) > 0 ? Math.floor((Number(amount) / nav) * 1000) / 1000 : null;
  const sellQty = sellAll ? Number(unitsHeld ?? 0) : Number(units);
  const estProceeds = nav && sellQty > 0 ? Math.floor(sellQty * nav * 100) / 100 : null;

  function reset() {
    setAmount('');
    setUnits('');
    setSellAll(false);
    setReason('');
    setReviewing(false);
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!reviewing) {
      setReviewing(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const trade =
        side === 'BUY'
          ? await api<Trade>('/me/buy', {
              method: 'POST',
              // expectedNavDate: the server refuses the trade if a newer NAV appeared after this page loaded.
              body: { schemeCode: fund.schemeCode, amount, reason, expectedNavDate: fund.navDate },
            })
          : await api<Trade>('/me/sell', {
              method: 'POST',
              body: {
                schemeCode: fund.schemeCode,
                ...(sellAll ? { sellAll: true } : { units }),
                reason: reason || undefined,
                expectedNavDate: fund.navDate,
              },
            });
      setDone(trade);
      reset();
      onDone();
    } catch (err) {
      setError(err as ApiError);
      setReviewing(false);
      // Show the new NAV so the student reviews the real price before confirming again.
      if ((err as ApiError).code === 'NAV_CHANGED') onNavChanged();
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="self-start">
        <div className="text-sm font-medium text-accent">{done.type === 'BUY' ? 'Investment recorded' : 'Sale recorded'}</div>
        <p className="num mt-2 text-lg">
          {done.type === 'BUY' ? 'You bought' : 'You sold'} <strong>{done.units}</strong> units for <strong>{inr(done.amount, true)}</strong>
        </p>
        <p className="mt-1 text-sm text-muted">
          At the NAV of {inr(done.navUsed, true)} published for {navDate(done.navDate)}.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" onClick={() => setDone(null)}>
            Make another
          </Button>
          <Link to="/student" className="inline-flex items-center rounded-xl bg-accent px-4 py-2.5 font-medium text-paper">
            See my portfolio
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="self-start lg:sticky lg:top-6">
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-paper p-1 text-sm" role="tablist">
        {(['BUY', 'SELL'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={side === s}
            onClick={() => {
              setSide(s);
              setError(null);
              setReviewing(false);
            }}
            className={`rounded-lg py-2 font-medium ${side === s ? 'bg-card shadow-sm' : 'text-muted'}`}
          >
            {s === 'BUY' ? 'Invest' : 'Sell units'}
          </button>
        ))}
      </div>

      {side === 'BUY' && !fund.active ? (
        <ErrorBox error="This fund has been removed from the class list, so new investments are closed. You can still sell units you own." />
      ) : tradingBlocked ? (
        <ErrorBox error="Trading is paused for this fund because we don't have a recent published NAV. Nothing can be bought or sold until it updates." />
      ) : side === 'BUY' ? (
        <form onSubmit={confirm} className="space-y-4">
          <Field label="Amount to invest (₹)" hint={`You have ${inr(cash, true)} cash left. Minimum ₹100.`}>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^\d.]/g, ''));
                setReviewing(false);
              }}
              placeholder="5000"
              required
              disabled={reviewing}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[1000, 5000, 10000, 25000].map((v) => (
              <button
                type="button"
                key={v}
                disabled={reviewing}
                onClick={() => setAmount(String(v))}
                className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:text-ink"
              >
                {inr(String(v))}
              </button>
            ))}
          </div>
          <Field label="Why are you making this investment?" hint={`${reason.trim().length}/${REASON_MAX} · your teacher can read this`}>
            <Textarea
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. I chose a large-cap fund because established companies should be less volatile."
              required
              minLength={REASON_MIN}
              disabled={reviewing}
            />
          </Field>
          {estUnits !== null && (
            <p className="num text-sm text-muted">
              ≈ {estUnits.toFixed(3)} units at {inr(fund.nav, true)} (NAV for {navDate(fund.navDate)})
            </p>
          )}
          {reviewing && (
            <div className="rounded-xl bg-accent-soft p-3 text-sm">
              Invest <strong>{inr(amount, true)}</strong> in {fund.schemeName} at the NAV published for {navDate(fund.navDate)}?
            </div>
          )}
          {error && <ErrorBox error={error} />}
          <div className="flex gap-2">
            {reviewing && (
              <Button type="button" variant="ghost" onClick={() => setReviewing(false)}>
                Change
              </Button>
            )}
            <Button type="submit" disabled={busy || reason.trim().length < REASON_MIN || !(Number(amount) > 0)} className="flex-1">
              {busy ? 'Recording…' : reviewing ? 'Confirm investment' : 'Review'}
            </Button>
          </div>
        </form>
      ) : !unitsHeld ? (
        <p className="text-sm text-muted">You don’t own any units of this fund yet.</p>
      ) : (
        <form onSubmit={confirm} className="space-y-4">
          <p className="num text-sm">
            You own <strong>{unitsHeld}</strong> units, worth about {inr(String(Number(unitsHeld) * (nav ?? 0)), true)}.
          </p>
          <Field label="Units to sell" hint="Selling a mutual fund is called redeeming.">
            <Input
              inputMode="decimal"
              value={sellAll ? unitsHeld : units}
              onChange={(e) => {
                setUnits(e.target.value.replace(/[^\d.]/g, ''));
                setSellAll(false);
                setReviewing(false);
              }}
              disabled={reviewing}
              required
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sellAll} onChange={(e) => setSellAll(e.target.checked)} disabled={reviewing} />
            Sell all my units
          </label>
          <Field label="Why are you selling? (optional)">
            <Textarea rows={2} maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} disabled={reviewing} />
          </Field>
          {estProceeds !== null && <p className="num text-sm text-muted">≈ {inr(String(estProceeds), true)} back to your cash</p>}
          {reviewing && (
            <div className="rounded-xl bg-warn-soft p-3 text-sm">
              Sell <strong>{sellAll ? unitsHeld : units}</strong> units at the NAV published for {navDate(fund.navDate)}?
            </div>
          )}
          {error && <ErrorBox error={error} />}
          <div className="flex gap-2">
            {reviewing && (
              <Button type="button" variant="ghost" onClick={() => setReviewing(false)}>
                Change
              </Button>
            )}
            <Button type="submit" variant={reviewing ? 'danger' : 'primary'} disabled={busy || !(sellQty > 0)} className="flex-1">
              {busy ? 'Recording…' : reviewing ? 'Confirm sale' : 'Review'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
