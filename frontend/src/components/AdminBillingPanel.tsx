import { useCallback, useEffect, useState } from 'react';
import { api, type AdminBillingOverview } from '../lib/api';

const input = 'mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/40';
const money = (value: number) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

type SettingsForm = { membershipFeeQuote: string; membershipDays: string; profitFeePercent: string; minBalanceQuote: string; referralPercents: string };

export function AdminBillingPanel({ token, adminSessionToken }: { token: string; adminSessionToken: string }) {
  const [overview, setOverview] = useState<AdminBillingOverview | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [adjustment, setAdjustment] = useState({ email: '', amountQuote: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getAdminBilling(token, adminSessionToken);
      setOverview(next);
      setForm({
        membershipFeeQuote: String(next.settings.membershipFeeQuote), membershipDays: String(next.settings.membershipDays),
        profitFeePercent: String(next.settings.profitFeePercent), minBalanceQuote: String(next.settings.minBalanceQuote),
        referralPercents: next.settings.referralPercents.join(', '),
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load billing'); }
  }, [token, adminSessionToken]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await action(); setNotice(done); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed'); }
    finally { setBusy(false); }
  }

  if (!overview || !form) return <section className="mt-6 text-sm text-slate-400">{error ?? 'Loading billing…'}</section>;
  const t = overview.totals;

  return <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
    <h2 className="text-xl font-semibold">Billing &amp; referrals</h2>
    <p className="mt-1 text-sm text-slate-400">Profit fees apply to Binance LIVE positions closed since {new Date(overview.settings.profitFeeStartAt).toLocaleString()}. Deposits are {overview.depositsEnabled ? 'enabled' : 'disabled (configure DEPOSIT_XPUB)'}.</p>
    {error && <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    {notice && <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{notice}</div>}

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Deposits', money(t.depositsQuote)], ['Membership fees', money(t.membershipFeesQuote)], ['Profit fees', money(t.profitFeesQuote)],
        ['Referral rewards paid', money(t.referralRewardsQuote)], ['User balances held', money(t.userBalancesQuote)], ['Admin adjustments', money(t.adminAdjustmentsQuote)],
        ['Accounts', String(t.accounts)], ['Active members', String(t.activeMembers)],
      ].map(([label, value]) => <article key={label} className="rounded-xl bg-slate-950/30 p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 font-semibold">{value}</p></article>)}
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
        <h3 className="font-semibold">Fee settings</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Membership fee (USDT)<input type="number" min="0" value={form.membershipFeeQuote} onChange={(event) => setForm({ ...form, membershipFeeQuote: event.target.value })} className={input} /></label>
          <label className="text-sm text-slate-300">Membership length (days)<input type="number" min="1" value={form.membershipDays} onChange={(event) => setForm({ ...form, membershipDays: event.target.value })} className={input} /></label>
          <label className="text-sm text-slate-300">Profit fee (%)<input type="number" min="0" max="50" value={form.profitFeePercent} onChange={(event) => setForm({ ...form, profitFeePercent: event.target.value })} className={input} /></label>
          <label className="text-sm text-slate-300">Minimum balance to trade (USDT)<input type="number" min="0" value={form.minBalanceQuote} onChange={(event) => setForm({ ...form, minBalanceQuote: event.target.value })} className={input} /></label>
          <label className="text-sm text-slate-300 sm:col-span-2">Referral reward % per level (comma-separated, up to 5 levels)<input value={form.referralPercents} onChange={(event) => setForm({ ...form, referralPercents: event.target.value })} className={input} /></label>
        </div>
        <button type="button" disabled={busy} onClick={() => void run(() => api.updateAdminBillingSettings(token, adminSessionToken, {
          membershipFeeQuote: Number(form.membershipFeeQuote), membershipDays: Number(form.membershipDays),
          profitFeePercent: Number(form.profitFeePercent), minBalanceQuote: Number(form.minBalanceQuote),
          referralPercents: form.referralPercents.split(',').map((value) => value.trim()).filter(Boolean).map(Number),
        }), 'Fee settings saved')} className="mt-4 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Save settings</button>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
        <h3 className="font-semibold">Manual balance adjustment</h3>
        <p className="mt-1 text-xs text-slate-500">Use a negative amount to debit. Every adjustment is recorded in the audit log.</p>
        <div className="mt-3 grid gap-3">
          <label className="text-sm text-slate-300">User email<input type="email" value={adjustment.email} onChange={(event) => setAdjustment({ ...adjustment, email: event.target.value })} className={input} /></label>
          <label className="text-sm text-slate-300">Amount (USDT)<input type="number" value={adjustment.amountQuote} onChange={(event) => setAdjustment({ ...adjustment, amountQuote: event.target.value })} className={input} /></label>
          <label className="text-sm text-slate-300">Reason<input value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} className={input} /></label>
        </div>
        <button type="button" disabled={busy} onClick={() => void run(async () => {
          await api.adjustAdminBalance(token, adminSessionToken, { email: adjustment.email, amountQuote: Number(adjustment.amountQuote), reason: adjustment.reason });
          setAdjustment({ email: '', amountQuote: '', reason: '' });
        }, 'Balance adjusted')} className="mt-4 rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-50">Apply adjustment</button>
      </div>
    </div>

    <h3 className="mt-6 font-semibold">Recent deposits</h3>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
      <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Date</th><th>User</th><th>Amount</th><th>Transaction</th></tr></thead>
      <tbody>{overview.recentDeposits.map((deposit) => <tr key={deposit.id} className="border-t border-white/10">
        <td className="py-3">{new Date(deposit.createdAt).toLocaleString()}</td>
        <td>{deposit.user.email}</td>
        <td>{money(deposit.amountQuote)}</td>
        <td><a className="font-mono text-xs text-cyan-300" href={`https://bscscan.com/tx/${deposit.txHash}`} target="_blank" rel="noreferrer">{deposit.txHash.slice(0, 18)}…</a></td>
      </tr>)}</tbody>
    </table>{overview.recentDeposits.length === 0 && <p className="py-5 text-sm text-slate-500">No deposits yet.</p>}</div>
  </section>;
}
