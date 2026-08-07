import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api, type AdminAuditEvent, type AdminBackup, type AdminHealth, type AdminMonitoringStatus } from '../lib/api';

const ADMIN_SESSION_KEY = 'hbs_admin_step_up_session';

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminPage() {
  const { token, user } = useAuth();
  const [adminSessionToken, setAdminSessionToken] = useState<string | null>(() => sessionStorage.getItem(ADMIN_SESSION_KEY));
  const [adminPassword, setAdminPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [backups, setBackups] = useState<AdminBackup[]>([]);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [monitoring, setMonitoring] = useState<AdminMonitoringStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');

  const refresh = useCallback(async () => {
    if (!token || !adminSessionToken) return;
    try {
      const [nextHealth, nextBackups, nextAudit, nextMonitoring] = await Promise.all([api.getAdminHealth(token, adminSessionToken), api.listAdminBackups(token, adminSessionToken), api.listAdminAudit(token, adminSessionToken), api.getAdminMonitoring(token, adminSessionToken)]);
      setHealth(nextHealth); setBackups(nextBackups); setAudit(nextAudit); setMonitoring(nextMonitoring); setError(null);
    } catch {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      setAdminSessionToken(null);
      setLoginError('Administrator session expired or is no longer valid. Please enter the admin password again.');
    }
  }, [token, adminSessionToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function adminLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setLoginBusy(true); setLoginError(null);
    try {
      const result = await api.createAdminSession(token, adminPassword);
      sessionStorage.setItem(ADMIN_SESSION_KEY, result.adminSessionToken);
      setAdminSessionToken(result.adminSessionToken);
      setAdminPassword('');
    } catch (reason) { setLoginError(reason instanceof Error ? reason.message : 'Administrator login failed'); }
    finally { setLoginBusy(false); }
  }

  function adminLogout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAdminSessionToken(null);
    setHealth(null); setBackups([]); setAudit([]); setMonitoring(null);
  }

  async function createBackup() {
    if (!token || !adminSessionToken) return;
    setBusy(true); setError(null);
    try { await api.createAdminBackup(token, adminSessionToken); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Backup failed'); }
    finally { setBusy(false); }
  }

  async function runHealthCheck() {
    if (!token || !adminSessionToken) return;
    setBusy(true); setError(null);
    try { await api.runAdminMonitoringCheck(token, adminSessionToken); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Health check failed'); }
    finally { setBusy(false); }
  }

  async function download(filename: string) {
    if (!token || !adminSessionToken) return;
    try {
      const blob = await api.downloadAdminBackup(token, adminSessionToken, filename);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Download failed'); }
  }

  async function restore() {
    if (!token || !adminSessionToken || !restoreFile) return;
    setBusy(true); setError(null);
    try { await api.restoreAdminBackup(token, adminSessionToken, restoreFile, confirmation); setRestoreFile(null); setConfirmation(''); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Restore failed'); }
    finally { setBusy(false); }
  }

  if (!adminSessionToken) return <main className="grid min-h-screen place-items-center bg-[#07111f] px-4 py-8 text-slate-100">
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/20 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Restricted operations</p>
      <h1 className="mt-3 text-2xl font-semibold">Administrator login</h1>
      <p className="mt-2 text-sm leading-6 text-slate-400">Enter the separate administrator password to continue as {user?.email}.</p>
      {loginError && <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{loginError}</div>}
      <form className="mt-6" onSubmit={(event) => void adminLogin(event)}>
        <label htmlFor="admin-password" className="text-sm font-medium text-slate-300">Admin password</label>
        <input id="admin-password" type="password" autoComplete="current-password" minLength={12} required value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-400/40" />
        <button disabled={loginBusy} type="submit" className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">{loginBusy ? 'Checking…' : 'Unlock Admin Center'}</button>
      </form>
      <Link to="/" className="mt-5 block text-center text-sm text-slate-400 hover:text-slate-200">Back to trading</Link>
    </section>
  </main>;

  return <main className="min-h-screen bg-[#07111f] px-4 py-6 text-slate-100 sm:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">Admin & Operations Center</p><h1 className="mt-2 text-3xl font-semibold">Production operations</h1><p className="mt-2 text-sm text-slate-400">Signed in as {user?.email}</p></div>
        <div className="flex gap-2"><button type="button" onClick={adminLogout} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Lock Admin</button><Link to="/" className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-300">Back to trading</Link></div>
      </header>
      {error && <div className="mt-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {(['backend', 'database', 'redis', 'scheduler'] as const).map((key) => <article key={key} className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{key}</p><p className={`mt-2 font-semibold ${health?.[key] === 'ERROR' ? 'text-rose-300' : 'text-emerald-300'}`}>{health?.[key] ?? '—'}</p></article>)}
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Maintenance</p><p className={`mt-2 font-semibold ${health?.maintenance.active ? 'text-amber-300' : 'text-emerald-300'}`}>{health?.maintenance.active ? 'ACTIVE' : 'OFF'}</p></article>
      </section>
      {health && (health.backupTools === 'MISSING' || !health.persistentBackupDirectoryConfigured) && <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">Backup setup needs attention: PostgreSQL tools are {health.backupTools.toLowerCase()} and persistent backup storage is {health.persistentBackupDirectoryConfigured ? 'configured' : 'not configured'}. Do not enable scheduled backups until both are ready.</div>}

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">Monitoring &amp; alerts</h2><p className="mt-1 text-sm text-slate-400">Checks production health every minute. New incidents and recoveries are sent through your configured notification channels, including Telegram.</p></div><button disabled={busy} onClick={() => void runHealthCheck()} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-200 disabled:opacity-50">{busy ? 'Checking…' : 'Run health check'}</button></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><article className="rounded-xl bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Monitor</p><p className={`mt-2 font-semibold ${monitoring?.enabled ? 'text-emerald-300' : 'text-amber-300'}`}>{monitoring?.enabled ? 'ENABLED' : 'DISABLED'}</p></article><article className="rounded-xl bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Active incidents</p><p className={`mt-2 font-semibold ${(monitoring?.activeIncidents ?? 0) > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{monitoring?.activeIncidents ?? '—'}</p></article><article className="rounded-xl bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Last check</p><p className="mt-2 text-sm font-semibold text-slate-200">{monitoring?.lastCheckedAt ? new Date(monitoring.lastCheckedAt).toLocaleString() : 'Not run yet'}</p></article></div>
        <div className="mt-5 space-y-2">{monitoring?.incidents.slice(0, 10).map((incident) => <div key={incident.id} className={`rounded-xl border px-4 py-3 text-sm ${incident.active ? 'border-rose-400/30 bg-rose-400/10' : 'border-white/10 bg-slate-950/20'}`}><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span><span className={`font-semibold ${incident.active ? 'text-rose-200' : 'text-emerald-300'}`}>{incident.active ? 'OPEN' : 'RESOLVED'}</span> · {incident.component}</span><span className="text-xs text-slate-500">{new Date(incident.lastCheckedAt).toLocaleString()}</span></div><p className="mt-1 text-slate-400">{incident.message}</p></div>)}</div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">Database backups</h2><p className="mt-1 text-sm text-slate-400">Verified PostgreSQL custom-format archives. Production storage should use a persistent disk.</p></div><button disabled={busy} onClick={() => void createBackup()} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{busy ? 'Working…' : 'Create backup now'}</button></div>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Created</th><th>File</th><th>Size</th><th>Actions</th></tr></thead><tbody>{backups.map((backup) => <tr key={backup.filename} className="border-t border-white/10"><td className="py-4">{new Date(backup.createdAt).toLocaleString()}</td><td className="font-mono text-xs">{backup.filename}</td><td>{bytes(backup.sizeBytes)}</td><td><div className="flex gap-2"><button onClick={() => void download(backup.filename)} className="rounded-lg border border-white/10 px-3 py-1.5">Download</button><button onClick={() => { setRestoreFile(backup.filename); setConfirmation(''); }} className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-rose-200">Restore</button></div></td></tr>)}</tbody></table>{backups.length === 0 && <p className="py-5 text-sm text-slate-500">No backups yet.</p>}</div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><h2 className="text-xl font-semibold">Admin audit log</h2><div className="mt-4 space-y-2">{audit.slice(0, 20).map((event) => <div key={event.id} className="flex flex-col gap-1 rounded-xl bg-slate-950/30 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span><span className="font-semibold text-cyan-200">{event.action}</span>{event.target ? ` · ${event.target}` : ''}</span><span className="text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()} · {event.admin.email}</span></div>)}</div></section>
    </div>

    {restoreFile && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/85 p-4 backdrop-blur-sm"><section className="w-full max-w-xl rounded-2xl border border-rose-400/30 bg-[#0a1728] p-6"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Destructive operation</p><h2 className="mt-2 text-2xl font-semibold">Restore database backup?</h2><p className="mt-3 text-sm leading-6 text-slate-300">Trading automation will be stopped. A safety backup is created first. After restore, LIVE/Testnet strategies remain STOPPED and must be reviewed manually.</p><p className="mt-4 text-sm text-slate-400">Type <span className="font-mono text-slate-100">RESTORE {restoreFile}</span></p><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 font-mono text-sm outline-none focus:ring-2 focus:ring-rose-400/40" /><div className="mt-5 flex justify-end gap-3"><button disabled={busy} onClick={() => setRestoreFile(null)} className="rounded-xl border border-white/10 px-4 py-2.5">Cancel</button><button disabled={busy || confirmation !== `RESTORE ${restoreFile}`} onClick={() => void restore()} className="rounded-xl bg-rose-500 px-4 py-2.5 font-semibold text-white disabled:opacity-40">{busy ? 'Restoring…' : 'Restore database'}</button></div></section></div>}
  </main>;
}
