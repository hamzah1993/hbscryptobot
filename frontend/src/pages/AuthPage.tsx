import { FormEvent, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export function AuthPage() {
  const { user, login, register } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const resetToken = searchParams.get('resetToken') ?? '';
  const [mode, setModeState] = useState<Mode>(resetToken ? 'reset' : 'login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  function setMode(next: Mode) {
    setModeState(next);
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmPassword('');
    if (next !== 'reset' && resetToken) setSearchParams({}, { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (mode === 'login') {
        await login(email, password);
      } else if (mode === 'register') {
        await register(fullName, email, password);
      } else if (mode === 'forgot') {
        await api.forgotPassword(email);
        setSuccess('If an account exists for that email, a password reset link has been sent.');
      } else {
        if (!resetToken) throw new Error('This password reset link is invalid.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        await api.resetPassword(resetToken, password);
        setSearchParams({}, { replace: true });
        setModeState('login');
        setSuccess('Password reset successfully. Sign in with your new password.');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Reset your password' : 'Choose a new password';
  const buttonLabel = mode === 'login' ? 'Sign in' : mode === 'register' ? 'Register' : mode === 'forgot' ? 'Send reset link' : 'Reset password';

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <p className="text-sm uppercase tracking-[0.3em] text-emerald-400">HBS Trading</p>
        <h1 className="mt-3 text-3xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-slate-400">{mode === 'forgot' ? 'Enter your account email and we’ll send a one-time reset link.' : mode === 'reset' ? 'Your reset link is single-use and expires after 30 minutes.' : 'Secure access to your automated trading dashboard.'}</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === 'register' && (
            <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-500" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          )}
          {mode !== 'reset' && (
            <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-500" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          )}
          {mode !== 'forgot' && (
            <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-500" type="password" placeholder={mode === 'reset' ? 'New password (minimum 8 characters)' : 'Password (minimum 8 characters)'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          )}
          {mode === 'reset' && (
            <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-emerald-500" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
          )}
          {error && <p className="rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</p>}
          {success && <p className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{success}</p>}
          <button disabled={submitting} className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">
            {submitting ? 'Please wait…' : buttonLabel}
          </button>
        </form>

        {mode === 'login' && <button className="mt-4 w-full text-sm text-cyan-300 hover:text-cyan-100" onClick={() => setMode('forgot')}>Forgot password?</button>}
        <button className="mt-3 w-full text-sm text-slate-400 hover:text-slate-100" onClick={() => setMode(mode === 'register' ? 'login' : mode === 'login' ? 'register' : 'login')}>
          {mode === 'register' ? 'Already registered? Sign in' : mode === 'login' ? 'Need an account? Register' : 'Back to sign in'}
        </button>
      </section>
    </main>
  );
}
