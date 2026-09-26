import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HoldingsTable, TradeList } from '../../components/portfolio';
import { Button, Card, ErrorBox, H1, H2, Loading, Stat } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { inr, navDate, pct, signedInr, tone } from '../../lib/format';
import type { StudentDetail } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export function TeacherStudent() {
  const { id, studentId } = useParams();
  const { data, error, loading, reload } = useApi<StudentDetail>(`/classrooms/${id}/students/${studentId}`);
  const [pin, setPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<ApiError | null>(null);

  async function resetPin() {
    if (!window.confirm('Give this student a new PIN? Their old PIN will stop working.')) return;
    setPinError(null);
    try {
      setPin((await api<{ pin: string }>(`/classrooms/${id}/students/${studentId}/reset-pin`, { method: 'POST' })).pin);
    } catch (err) {
      setPinError(err as ApiError);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const d = data!;
  const p = d.portfolio;

  return (
    <>
      <Link to={`/teacher/classes/${id}`} className="text-sm text-muted hover:text-ink">
        ← {d.classroom.name}
      </Link>
      <div className="mt-2">
        <H1 sub={`Joined ${navDate(d.student.joinedAt.slice(0, 10))}`}>{d.student.displayName}</H1>
      </div>

      {d.nudges.length > 0 && (
        <div className="mb-6 rounded-2xl border border-warn/20 bg-warn-soft p-4">
          <div className="text-sm font-medium text-warn">Worth a conversation</div>
          <ul className="mt-1 list-disc pl-5 text-sm text-warn">
            {d.nudges.map((n) => (
              <li key={n.code}>{n.message}</li>
            ))}
          </ul>
        </div>
      )}

      <Card className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Portfolio value" value={inr(p.totalValue)} />
        <Stat label="Gain / loss" value={signedInr(p.gain, Math.abs(Number(p.gain)) < 100)} valueClass={tone(p.gain)} hint={pct(p.returnPct)} />
        <Stat label="Cash left" value={inr(p.cash)} />
        <Stat label="Invested" value={inr(p.invested)} hint={`${p.holdings.length} funds`} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <H2>Holdings</H2>
          <HoldingsTable holdings={p.holdings} />
        </Card>
        <Card>
          <H2>Decisions and reasons</H2>
          <TradeList trades={d.trades} />
        </Card>
      </div>

      <Card className="mt-6">
        <H2>Student can’t log in?</H2>
        <p className="text-sm text-muted">Students don’t have email, so a lost PIN can only be replaced by you.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={resetPin}>
            Issue a new PIN
          </Button>
          {pin && (
            <span>
              New PIN: <span className="font-mono text-xl font-semibold tracking-widest">{pin}</span>
            </span>
          )}
        </div>
        {pinError && <div className="mt-3"><ErrorBox error={pinError} /></div>}
      </Card>
    </>
  );
}
