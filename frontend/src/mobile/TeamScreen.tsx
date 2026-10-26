import { Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Card, ErrorNote, PrimaryButton, SecondaryButton, money, usePolling } from './ui';

export function TeamScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { data, error } = usePolling(() => api.getReferrals(token!));
  const [copied, setCopied] = useState<string | null>(null);
  const link = data ? `${window.location.origin}/auth?ref=${encodeURIComponent(data.referralCode)}` : '';

  async function copy(kind: string, value: string) {
    try { await navigator.clipboard.writeText(value); setCopied(kind); window.setTimeout(() => setCopied(null), 2000); } catch { /* clipboard unavailable */ }
  }

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: 'Join me on HBS Trading', text: `Use my invitation code ${data!.referralCode}`, url: link }); return; } catch { /* cancelled */ }
    }
    await copy('link', link);
  }

  return <>
    <header className="sticky top-0 z-20 bg-[#f4f5f7]/95 px-4 py-4 text-center backdrop-blur"><h1 className="text-lg font-semibold">Team</h1></header>
    <main className="space-y-3 px-3">
      <ErrorNote message={error} />
      {data && <>
        <section className="rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-500 p-5 text-white shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Your invitation code</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-[0.2em]">{data.referralCode}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void copy('code', data.referralCode)} className="flex items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 py-2.5 text-sm font-semibold"><Copy className="h-4 w-4" />{copied === 'code' ? 'Copied' : 'Copy code'}</button>
            <button type="button" onClick={() => void share()} className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-sm font-semibold text-teal-700"><Share2 className="h-4 w-4" />{copied === 'link' ? 'Link copied' : 'Share link'}</button>
          </div>
        </section>

        <Card>
          <p className="text-sm text-slate-500">Total rewards earned</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{money(data.totalEarnedQuote)}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">You receive a share of the platform fees your team pays. Rewards go to your fuel balance.</p>
          {!data.eligible && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Activate your membership to receive rewards. Fees paid while you are inactive earn you nothing.</p>}
        </Card>

        <Card>
          <h2 className="font-semibold">My team</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {data.levels.map((level) => <div key={level.level} className="flex items-center justify-between py-3">
              <div><p className="font-medium">Level {level.level} <span className="text-xs font-normal text-slate-400">· {level.rewardPercent}% of fees</span></p><p className="text-xs text-slate-400">{level.members} members · {level.activeMembers} active</p></div>
              <p className="font-semibold text-emerald-600">+{level.earnedQuote.toFixed(2)}</p>
            </div>)}
          </div>
          <p className="mt-2 text-xs text-slate-400">Level 1 is people you invited; level 2 is people they invited, and so on.</p>
        </Card>
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={() => void copy('link', link)}>{copied === 'link' ? 'Copied' : 'Copy invite link'}</SecondaryButton>
          <PrimaryButton onClick={() => navigate('/rewards')}>Reward details</PrimaryButton>
        </div>
      </>}
    </main>
  </>;
}
