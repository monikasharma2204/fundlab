import { Link, useParams } from 'react-router-dom';
import { NudgeBadges } from '../../components/portfolio';
import { Card, Empty, ErrorBox, H1, H2, Loading, Stat } from '../../components/ui';
import { inr, pct, relativeDays, tone } from '../../lib/format';
import type { Dashboard } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export function ClassDashboard() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<Dashboard>(`/classrooms/${id}`);

  if (loading && !data) return <Loading label="Valuing every portfolio at the latest NAV…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const d = data!;
  const needsNudge = d.leaderboard.filter((r) => r.nudges.length > 0);

  return (
    <>
      <Link to="/teacher" className="text-sm text-muted hover:text-ink">
        ← My classes
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <H1 sub={`${inr(d.classroom.startingCorpus)} virtual money per student`}>{d.classroom.name}</H1>
        <div className="mb-6 rounded-2xl border border-line bg-card px-5 py-3 text-center">
          <div className="text-xs uppercase tracking-wide text-muted">Class code</div>
          <div className="font-mono text-2xl font-semibold tracking-[0.3em]">{d.classroom.joinCode}</div>
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        <Stat label="Students" value={d.stats.students} />
        <Stat label="Have invested" value={`${d.stats.investedStudents} / ${d.stats.students}`} />
        <Stat
          label="Average return"
          value={pct(d.stats.averageReturnPct)}
          valueClass={tone(d.stats.averageReturnPct)}
          hint={`median ${pct(d.stats.medianReturnPct)}`}
        />
        <Stat label="Could use a nudge" value={d.stats.needsNudge} valueClass={d.stats.needsNudge ? 'text-warn' : ''} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <H2 right={<span className="text-xs text-muted">Ranked by return. Students who haven’t invested aren’t ranked.</span>}>Leaderboard</H2>
          {d.leaderboard.length === 0 ? (
            <Empty title="No students yet">Share the class code {d.classroom.joinCode} so students can join.</Empty>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 text-right font-medium">Portfolio</th>
                    <th className="px-3 py-2 text-right font-medium">Return</th>
                    <th className="px-3 py-2 text-right font-medium">Cash</th>
                    <th className="px-5 py-2 font-medium">Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {d.leaderboard.map((r) => (
                    <tr key={r.studentId} className="border-b border-line/60 last:border-0 hover:bg-paper/60">
                      <td className="num px-5 py-3 text-muted">{r.rank ?? '–'}</td>
                      <td className="px-3 py-3">
                        <Link to={`/teacher/classes/${d.classroom.id}/students/${r.studentId}`} className="font-medium hover:underline">
                          {r.displayName}
                        </Link>
                        <div className="text-xs text-muted">
                          {r.fundsHeld} fund{r.fundsHeld === 1 ? '' : 's'} · last active {relativeDays(r.lastActivityAt)}
                        </div>
                      </td>
                      <td className="num px-3 py-3 text-right">{inr(r.totalValue)}</td>
                      <td className={`num px-3 py-3 text-right font-medium ${r.started ? tone(r.returnPct) : 'text-muted'}`}>
                        {r.started ? pct(r.returnPct) : '—'}
                      </td>
                      <td className="num px-3 py-3 text-right text-muted">{r.cashSharePct}%</td>
                      <td className="px-5 py-3">
                        <NudgeBadges nudges={r.nudges} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="self-start">
          <H2>Needs a nudge</H2>
          <p className="-mt-1 mb-4 text-sm text-muted">
            Based on <em>how</em> students are deciding — not on returns. A careful portfolio can be down this month; a reckless one can be up.
          </p>
          {needsNudge.length === 0 ? (
            <Empty title="Nobody right now">Every student has invested with spread-out holdings and real reasons.</Empty>
          ) : (
            <ul className="space-y-3">
              {needsNudge.map((r) => (
                <li key={r.studentId}>
                  <Link
                    to={`/teacher/classes/${d.classroom.id}/students/${r.studentId}`}
                    className="block rounded-xl border border-warn/20 bg-warn-soft/60 p-3 hover:border-warn/50"
                  >
                    <div className="font-medium">{r.displayName}</div>
                    <ul className="mt-1 space-y-0.5 text-sm text-warn">
                      {r.nudges.map((n) => (
                        <li key={n.code}>{n.message}</li>
                      ))}
                    </ul>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
