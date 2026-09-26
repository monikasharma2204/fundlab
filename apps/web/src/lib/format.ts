/**
 * Display formatting only. The API sends exact decimal strings; converting to
 * Number here is safe because nothing computed on the client is ever sent back
 * or trusted — it only decides how many digits to show.
 */

const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function inr(value: string | null | undefined, exact = false): string {
  if (value == null) return '—';
  return (exact ? inr2 : inr0).format(Number(value));
}

export function signedInr(value: string, exact = false): string {
  const n = Number(value);
  const s = inr(String(Math.abs(n)), exact);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

export function pct(value: string | null | undefined): string {
  if (value == null) return '—';
  const n = Number(value);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;
}

export function tone(value: string | null | undefined): string {
  if (value == null) return 'text-muted';
  const n = Number(value);
  return n > 0 ? 'text-gain' : n < 0 ? 'text-loss' : 'text-muted';
}

export function navDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function relativeDays(iso: string | null): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const RISK_LABEL: Record<string, string> = {
  LOW: 'Low risk',
  MODERATE: 'Moderate risk',
  HIGH: 'High risk',
  VERY_HIGH: 'Very high risk',
};
