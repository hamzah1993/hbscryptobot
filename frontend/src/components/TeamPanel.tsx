import { useCallback, useEffect, useState } from 'react';
import { api, type ReferralSummary } from '../lib/api';

const money = (value: number) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

export function TeamPanel({ token }: { token: string }) {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const refresh = useCallback(async () => {
    try { setSummary(await api.getReferrals(token)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load your team'); }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!summary) return <section className="mt-6 text-sm text-slate-400">{error ?? 'Loading team…'}</section>;
  const link = `${window.location.origin}/auth?ref=${encodeURIComponent(summary.referralCode)}`;

  async function copy(kind: 'code' | 'link', value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(kind); window.setTimeout(() => setCopied(null), 2000); }
    catch { setError('Copy failed; select the text and copy it manually'); }
  }

  return <section className="mt-6 space-y-6">
    {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    <div className="grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 to-white/[0.02] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Your invitation code</p>
        <p className="mt-3 font-mono text-3xl font-semibold tracking-widest">{summary.referralCode}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy('code', summary.referralCode)} className="rounded-xl border border-white/10 px-4 py-2 text-sm">{copied === 'code' ? 'Copied' : 'Copy code'}</button>
          <button type="button" onClick={() => void copy('link', link)} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">{copied === 'link' ? 'Copied' : 'Copy invite link'}</button>
        </div>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Total rewards earned</p>
        <p className="mt-3 text-3xl font-semibold text-emerald-300">{money(summary.totalEarnedQuote)}</p>
        <p className="mt-2 text-xs text-slate-400">Rewards are a share of the platform fees your team pays and are added to your fuel balance.</p>
        {!summary.eligible && <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">Activate your membership to receive rewards. Fees paid while you are inactive earn you nothing.</p>}
      </article>
    </div>

    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <h3 className="text-lg font-semibold">My team</h3>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500"><tr><th className="pb-3">Level</th><th>Reward</th><th>Team</th><th>Active</th><th className="text-right">Earned</th></tr></thead>
        <tbody>{summary.levels.map((level) => <tr key={level.level} className="border-t border-white/10">
          <td className="py-3 font-semibold">L{level.level}</td>
          <td>{level.rewardPercent}%</td>
          <td>{level.members}</td>
          <td>{level.activeMembers}</td>
          <td className="text-right text-emerald-300">{level.earnedQuote.toFixed(2)}</td>
        </tr>)}</tbody>
      </table></div>
      <p className="mt-3 text-xs text-slate-500">Level 1 is people you invited directly; level 2 is people they invited, and so on.</p>
    </div>
  </section>;
}
