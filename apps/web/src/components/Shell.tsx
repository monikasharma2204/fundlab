import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearSession, getSession } from '../lib/session';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg bg-accent">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path d="M6 23 L13 15 L18 19 L26 9" stroke="#f6f1e7" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-display text-xl font-semibold tracking-tight">FundLab</span>
    </Link>
  );
}

const STUDENT_LINKS = [
  { to: '/student', label: 'My portfolio', end: true },
  { to: '/student/funds', label: 'Explore funds' },
  { to: '/student/history', label: 'History' },
];

export function Shell({ children }: { children: ReactNode }) {
  const session = getSession();
  const navigate = useNavigate();
  const links = session?.role === 'STUDENT' ? STUDENT_LINKS : session?.role === 'TEACHER' ? [{ to: '/teacher', label: 'My classes', end: true }] : [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Logo />
          {session && (
            <nav className="flex flex-wrap items-center gap-1 text-sm">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) => `rounded-lg px-3 py-1.5 ${isActive ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:text-ink'}`}
                >
                  {l.label}
                </NavLink>
              ))}
              <span className="mx-2 hidden text-muted sm:inline">·</span>
              <span className="hidden text-muted sm:inline">{session.name}</span>
              <button
                onClick={() => {
                  clearSession();
                  navigate('/');
                }}
                className="rounded-lg px-3 py-1.5 text-muted hover:text-ink"
              >
                Log out
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted">
        Virtual money only. Fund names and NAVs are real, published by AMFI via mfapi.in. Nothing here is investment advice.
      </footer>
    </div>
  );
}
