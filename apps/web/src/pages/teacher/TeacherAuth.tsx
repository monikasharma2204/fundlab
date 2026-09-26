import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBox, Field, Input } from '../../components/ui';
import { Logo } from '../../components/Shell';
import { api, ApiError } from '../../lib/api';
import { saveSession } from '../../lib/session';

interface AuthResponse {
  token: string;
  teacher: { name: string };
}

export function TeacherAuth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'login'
          ? await api<AuthResponse>('/auth/teacher/login', { method: 'POST', body: { email, password } })
          : await api<AuthResponse>('/auth/teacher/signup', { method: 'POST', body: { name, email, password } });
      saveSession({ role: 'TEACHER', token: res.token, name: res.teacher.name });
      navigate('/teacher');
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Logo />
      <Card className="mt-8">
        <h1 className="font-display text-2xl font-semibold">{mode === 'login' ? 'Teacher log in' : 'Create a teacher account'}</h1>
        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === 'signup' && (
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? 8 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </Field>
          {error && <ErrorBox error={error} />}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {mode === 'login' ? 'New here? ' : 'Already have an account? '}
          <button className="font-medium text-accent underline-offset-2 hover:underline" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Create an account' : 'Log in'}
          </button>
        </p>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        Just looking? Demo login: <span className="font-mono">demo.teacher@fundlab.app</span> / <span className="font-mono">fundlab-demo</span>
      </p>
      <p className="mt-2 text-center text-sm">
        <Link to="/join" className="text-muted hover:text-ink">
          I’m a student →
        </Link>
      </p>
    </div>
  );
}
