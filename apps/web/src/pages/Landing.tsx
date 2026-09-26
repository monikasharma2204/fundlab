import { Link, Navigate } from 'react-router-dom';
import { Logo } from '../components/Shell';
import { getSession } from '../lib/session';

export function Landing() {
  const session = getSession();
  if (session) return <Navigate to={session.role === 'TEACHER' ? '/teacher' : '/student'} replace />;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <Logo />
      </div>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:pt-16">
        <p className="text-sm font-medium uppercase tracking-widest text-accent">Real funds · Virtual money</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Make your first investing mistakes where they don’t cost anything.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Every student gets the same virtual money to invest in real Indian mutual funds. Prices are the real published NAVs.
          You explain every decision, then watch what the market actually does.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Link
            to="/join"
            className="group rounded-2xl border border-line bg-card p-6 transition hover:border-accent hover:shadow-sm"
          >
            <div className="text-sm font-medium text-accent">I’m a student</div>
            <div className="mt-1 font-display text-2xl font-semibold">Join my class →</div>
            <p className="mt-2 text-muted">Enter the 6-character code your teacher gave you. No email needed.</p>
          </Link>
          <Link
            to="/teacher/login"
            className="group rounded-2xl border border-line bg-card p-6 transition hover:border-accent hover:shadow-sm"
          >
            <div className="text-sm font-medium text-accent">I’m a teacher</div>
            <div className="mt-1 font-display text-2xl font-semibold">Run a class challenge →</div>
            <p className="mt-2 text-muted">Create a class, choose the starting money, and see how each student is deciding.</p>
          </Link>
        </div>

        <dl className="mt-14 grid gap-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-medium">No real money</dt>
            <dd className="mt-1 text-muted">Nothing is ever bought for real. Nobody can lose actual savings.</dd>
          </div>
          <div>
            <dt className="font-medium">Real prices, honestly dated</dt>
            <dd className="mt-1 text-muted">Mutual funds publish one NAV a day. We always show which day’s NAV you’re using.</dd>
          </div>
          <div>
            <dt className="font-medium">Reasons over returns</dt>
            <dd className="mt-1 text-muted">Every purchase asks “why?”. A good decision can still lose money this month.</dd>
          </div>
        </dl>
      </main>
    </div>
  );
}
