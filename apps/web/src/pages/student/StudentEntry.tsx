import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBox, Field, Input } from '../../components/ui';
import { Logo } from '../../components/Shell';
import { api, ApiError } from '../../lib/api';
import { saveSession } from '../../lib/session';

interface JoinResponse {
  token: string;
  pin: string;
  student: { displayName: string; classroomName: string };
}

export function StudentEntry() {
  const [mode, setMode] = useState<'join' | 'login'>('join');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<JoinResponse | null>(null);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'join') {
        const res = await api<JoinResponse>('/auth/student/join', { method: 'POST', body: { joinCode, displayName } });
        saveSession({ role: 'STUDENT', token: res.token, name: res.student.displayName });
        setJoined(res);
      } else {
        const res = await api<Omit<JoinResponse, 'pin'>>('/auth/student/login', { method: 'POST', body: { joinCode, displayName, pin } });
        saveSession({ role: 'STUDENT', token: res.token, name: res.student.displayName });
        navigate('/student');
      }
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  if (joined) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <Logo />
        <Card className="mt-8 text-center">
          <div className="text-sm text-accent">You’re in {joined.student.classroomName}</div>
          <h1 className="mt-1 font-display text-2xl font-semibold">Write down your PIN</h1>
          <p className="mt-2 text-muted">You’ll need it with your name and the class code to log in on another device.</p>
          <div className="my-6 font-mono text-5xl font-semibold tracking-[0.3em]">{joined.pin}</div>
          <p className="mb-5 text-sm text-muted">Lost it later? Your teacher can give you a new one.</p>
          <Button className="w-full" onClick={() => navigate('/student')}>
            I’ve written it down — show me my money
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Logo />
      <Card className="mt-8">
        <div className="mb-5 grid grid-cols-2 rounded-xl bg-paper p-1 text-sm" role="tablist">
          {(['join', 'login'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-lg py-2 font-medium ${mode === m ? 'bg-card shadow-sm' : 'text-muted'}`}
            >
              {m === 'join' ? 'Join a class' : 'I’ve joined before'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Class code" hint="6 letters and numbers, from your teacher">
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              className="font-mono text-lg tracking-[0.3em] uppercase"
              placeholder="BLUE42"
              required
              minLength={6}
              autoComplete="off"
            />
          </Field>
          <Field label="Your name in this class" hint={mode === 'join' ? 'A first name or nickname is enough' : undefined}>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={30} autoComplete="off" />
          </Field>
          {mode === 'login' && (
            <Field label="PIN">
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                className="font-mono tracking-[0.3em]"
                required
                minLength={6}
                autoComplete="off"
              />
            </Field>
          )}
          {error && <ErrorBox error={error} />}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Please wait…' : mode === 'join' ? 'Join class' : 'Log in'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        Demo: class <span className="font-mono">BLUE42</span>, name <span className="font-mono">Riya</span>, PIN <span className="font-mono">246810</span>
      </p>
      <p className="mt-2 text-center text-sm">
        <Link to="/teacher/login" className="text-muted hover:text-ink">
          I’m a teacher →
        </Link>
      </p>
    </div>
  );
}
