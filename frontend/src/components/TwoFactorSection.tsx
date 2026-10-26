import QRCode from 'qrcode';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api, type TwoFactorStatus } from '../lib/api';

const themes = {
  dark: {
    wrap: 'border-t border-white/10 p-5 sm:p-7', title: 'text-slate-200', muted: 'text-slate-500', text: 'text-slate-300',
    field: 'rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm outline-none focus:border-cyan-400/50',
    key: 'bg-slate-950/60 text-cyan-200', primary: 'bg-cyan-400 text-slate-950',
    on: 'border border-cyan-400/25 bg-cyan-400/10 text-cyan-200', off: 'border border-rose-400/30 bg-rose-400/10 text-rose-200',
    error: 'border border-rose-400/25 bg-rose-400/10 text-rose-200',
  },
  light: {
    wrap: 'rounded-2xl bg-white p-4 shadow-sm', title: 'text-slate-900', muted: 'text-slate-500', text: 'text-slate-600',
    field: 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-teal-500',
    key: 'bg-slate-100 text-teal-700', primary: 'bg-teal-600 text-white',
    on: 'bg-teal-50 text-teal-700', off: 'bg-rose-50 text-rose-600',
    error: 'bg-rose-50 text-rose-600',
  },
};
const codeInput = (value: string) => value.replace(/[^\d]/g, '').slice(0, 6);

/** Turn authenticator-app two-factor sign-in on or off. Required before opening the admin area. */
export function TwoFactorSection({ variant = 'dark' }: { variant?: keyof typeof themes }) {
  const t = themes[variant];
  const field = t.field;
  const { token } = useAuth();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) api.twoFactorStatus(token).then(setStatus).catch(() => setStatus(null));
  }, [token]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => {
    const result = await api.setupTwoFactor(token!);
    setSetup({ secret: result.secret, qr: await QRCode.toDataURL(result.otpauthUrl, { margin: 1, width: 200 }) });
    setCode('');
  });

  const enable = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.enableTwoFactor(token!, code);
      setSetup(null);
      setCode('');
      setStatus(await api.twoFactorStatus(token!));
    });
  };

  const disable = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.disableTwoFactor(token!, password, code);
      setDisabling(false);
      setCode('');
      setPassword('');
      setStatus(await api.twoFactorStatus(token!));
    });
  };

  return (
    <div className={t.wrap}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${t.title}`}>Two-factor authentication</p>
          <p className={`mt-1 text-xs leading-5 ${t.muted}`}>
            {status?.enabled
              ? 'On. Signing in asks for a code from your authenticator app.'
              : 'Off. Add a code from an authenticator app (Google Authenticator, Authy, 1Password) to every sign-in. Required for administrators.'}
          </p>
        </div>
        {status && !setup && !disabling && (
          status.enabled
            ? <button type="button" onClick={() => { setDisabling(true); setError(''); }} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${t.off}`}>Turn off</button>
            : <button type="button" disabled={busy} onClick={start} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${t.on}`}>Turn on</button>
        )}
      </div>

      {setup && (
        <form onSubmit={enable} className="mt-5 grid gap-4 sm:grid-cols-[200px_1fr]">
          <img src={setup.qr} alt="Scan with your authenticator app" className="h-[200px] w-[200px] rounded-xl bg-white p-2" />
          <div className={`space-y-3 text-sm ${t.text}`}>
            <p>1. Scan the QR code with your authenticator app, or enter this key manually:</p>
            <code className={`block break-all rounded-lg px-3 py-2 text-xs tracking-wider ${t.key}`}>{setup.secret}</code>
            <p>2. Enter the 6-digit code the app shows:</p>
            <div className="flex gap-2">
              <input inputMode="numeric" autoComplete="one-time-code" required pattern="\d{6}" value={code} onChange={(event) => setCode(codeInput(event.target.value))} placeholder="123456" className={`${field} w-36 text-center tracking-[0.3em]`} />
              <button disabled={busy || code.length !== 6} className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${t.primary}`}>Confirm</button>
              <button type="button" onClick={() => setSetup(null)} className="rounded-xl px-3 text-sm text-slate-400">Cancel</button>
            </div>
          </div>
        </form>
      )}

      {disabling && (
        <form onSubmit={disable} className="mt-5 grid gap-3 sm:grid-cols-3">
          <input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className={field} />
          <input inputMode="numeric" autoComplete="one-time-code" required pattern="\d{6}" value={code} onChange={(event) => setCode(codeInput(event.target.value))} placeholder="Authenticator code" className={field} />
          <div className="flex gap-2">
            <button disabled={busy} className="rounded-xl bg-rose-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">Turn off</button>
            <button type="button" onClick={() => setDisabling(false)} className="rounded-xl px-3 text-sm text-slate-400">Cancel</button>
          </div>
        </form>
      )}

      {error && <p className={`mt-3 rounded-xl px-4 py-3 text-sm ${t.error}`}>{error}</p>}
    </div>
  );
}
