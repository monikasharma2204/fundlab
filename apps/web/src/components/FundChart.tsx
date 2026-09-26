import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { inr, navDate } from '../lib/format';
import { useApi } from '../lib/useApi';
import { ErrorBox, Loading } from './ui';

const RANGES = ['1M', '6M', '1Y', '3Y', '5Y'] as const;

interface History {
  range: string;
  points: { date: string; nav: string }[];
}

export function FundChart({ schemeCode }: { schemeCode: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>('1Y');
  const { data, error, loading, reload } = useApi<History>(`/funds/${schemeCode}/history?range=${range}`);
  const points = data?.points.map((p) => ({ date: p.date, nav: Number(p.nav) })) ?? [];
  const up = points.length > 1 && points[points.length - 1].nav >= points[0].nav;
  const color = up ? '#1f7a4d' : '#a1452f';

  return (
    <div>
      <div className="mb-3 flex gap-1" role="tablist" aria-label="Chart period">
        {RANGES.map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={r === range}
            onClick={() => setRange(r)}
            className={`rounded-lg px-3 py-1 text-sm ${r === range ? 'bg-ink text-paper' : 'text-muted hover:bg-paper'}`}
          >
            {r}
          </button>
        ))}
      </div>
      {loading ? (
        <Loading label="Loading NAV history…" />
      ) : error ? (
        <ErrorBox error={error} onRetry={reload} />
      ) : (
        <div className="h-64" aria-label={`NAV history over ${range}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e3dccd" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                tick={{ fontSize: 12, fill: '#5f665f' }}
                minTickGap={40}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 12, fill: '#5f665f' }}
                width={56}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              />
              <Tooltip
                formatter={(v) => [inr(String(v), true), 'NAV']}
                labelFormatter={(d) => navDate(String(d))}
                contentStyle={{ borderRadius: 12, border: '1px solid #e3dccd', fontSize: 13 }}
              />
              <Area type="monotone" dataKey="nav" stroke={color} strokeWidth={2} fill="url(#navFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
