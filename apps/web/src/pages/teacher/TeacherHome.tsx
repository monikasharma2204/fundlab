import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Empty, ErrorBox, Field, H1, H2, Input, Loading } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { inr } from '../../lib/format';
import type { ClassroomSummary } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export function TeacherHome() {
  const classes = useApi<ClassroomSummary[]>('/classrooms');
  const [name, setName] = useState('');
  const [corpus, setCorpus] = useState('100000');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; joinCode: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await api<{ id: string; name: string; joinCode: string }>('/classrooms', {
        method: 'POST',
        body: { name, startingCorpus: Number(corpus) },
      });
      setCreated(c);
      setName('');
      classes.reload();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <H1 sub="Each class is its own challenge. Everyone in it starts with the same money.">My classes</H1>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {classes.loading ? (
            <Loading />
          ) : classes.error ? (
            <ErrorBox error={classes.error} onRetry={classes.reload} />
          ) : classes.data!.length === 0 ? (
            <Empty title="No classes yet">Create your first class to get a code for students.</Empty>
          ) : (
            <ul className="space-y-3">
              {classes.data!.map((c) => (
                <li key={c.id}>
                  <Link to={`/teacher/classes/${c.id}`} className="block rounded-2xl border border-line bg-card p-5 transition hover:border-accent">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-display text-lg font-semibold">{c.name}</div>
                      <div className="rounded-lg bg-paper px-3 py-1 font-mono text-lg tracking-widest">{c.joinCode}</div>
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {c.studentCount} student{c.studentCount === 1 ? '' : 's'} · {inr(c.startingCorpus)} each
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Card>
          <H2>New class</H2>
          {created && (
            <div className="mb-4 rounded-xl bg-accent-soft p-4 text-center">
              <div className="text-sm text-accent">Share this code with “{created.name}”</div>
              <div className="mt-1 font-mono text-3xl font-semibold tracking-[0.3em]">{created.joinCode}</div>
            </div>
          )}
          <form onSubmit={create} className="space-y-4">
            <Field label="Class name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Class 10B — Investment Challenge" required minLength={3} />
            </Field>
            <Field label="Starting money per student (₹)" hint="Every student gets exactly this. It can't be changed later, so everyone stays equal.">
              <Input type="number" inputMode="numeric" min={1000} max={10000000} step={1000} value={corpus} onChange={(e) => setCorpus(e.target.value)} required />
            </Field>
            {error && <ErrorBox error={error} />}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Creating…' : 'Create class & get code'}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
