import QRCode from 'qrcode';
import { useCallback, useEffect, useState } from 'react';
import { api, type BalanceEntry, type BalanceEntryType, type BillingOverview } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';

const money = (value: number) => `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
const entryLabel: Record<BalanceEntryType, string> = {
  DEPOSIT: 'Deposit',
  MEMBERSHIP_FEE: 'Membership',
  PROFIT_FEE: 'Profit fee',
  REFERRAL_REWARD: 'Referral reward',
  ADMIN_ADJUSTMENT: 'Adjustment',
};

export function WalletPanel({ token }: { token: string }) {
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [entries, setEntries] = useState<BalanceEntry[]>([]);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextBilling, nextEntries] = await Promise.all([api.getBilling(token), api.listBalanceEntries(token, 100)]);
      setBilling(nextBilling); setEntries(nextEntries); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load your wallet'); }
  }, [token]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const address = billing?.deposit.address ?? null;
  useEffect(() => {
    if (!address) { setQr(null); return; }
    QRCode.toDataURL(address, { margin: 1, width: 220 }).then(setQr).catch(() => setQr(null));
  }, [address]);

  async function copyAddress() {
    if (!address) return;
    try { await navigator.clipboard.writeText(address); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setError('Copy failed; select the address and copy it manually'); }
  }

  async function activate() {
    setBusy(true); setError(null);
    try { await api.activateMembership(token); setConfirming(false); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to activate membership'); }
    finally { setBusy(false); }
  }

  if (!billing) return <section className="mt-6 text-sm text-slate-400">{error ?? 'Loading wallet…'}</section>;
  const { fees, membership, trading } = billing;
  const canAfford = billing.balanceQuote >= fees.membershipFeeQuote;

  return <section className="mt-6 space-y-6">
    {error && <div className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

    <div className="grid gap-4 md:grid-cols-3">
      <article className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 to-white/[0.02] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Fuel balance</p>
        <p className={`mt-3 text-3xl font-semibold ${billing.balanceQuote < 0 ? 'text-rose-300' : ''}`}>{money(billing.balanceQuote)}</p>
        <p className="mt-2 text-xs text-slate-400">Pays your membership and the {fees.profitFeePercent}% fee on each profitable trade. Keep at least {money(fees.minBalanceQuote)} to keep trading.</p>
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Membership</p>
        <p className={`mt-3 text-2xl font-semibold ${membership.active ? 'text-emerald-300' : 'text-amber-200'}`}>{membership.active ? 'Active' : 'Inactive'}</p>
        <p className="mt-1 text-xs text-slate-400">{membership.active && membership.expiresAt ? `Valid until ${new Date(membership.expiresAt).toLocaleDateString()}` : `${money(fees.membershipFeeQuote)} for ${fees.membershipDays} days`}</p>
        <button type="button" disabled={busy || !canAfford} onClick={() => setConfirming(true)} className="mt-4 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">{membership.active ? 'Extend membership' : 'Activate membership'}</button>
        {!canAfford && <p className="mt-2 text-xs text-slate-500">Deposit at least {money(fees.membershipFeeQuote - Math.max(billing.balanceQuote, 0))} more to {membership.active ? 'extend' : 'activate'}.</p>}
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Trading status</p>
        <p className={`mt-3 text-2xl font-semibold ${trading.allowed ? 'text-emerald-300' : 'text-rose-300'}`}>{trading.allowed ? 'Ready' : 'Paused'}</p>
        <p className="mt-1 text-xs text-slate-400">{trading.allowed ? 'New LIVE trades can open. Exits always run.' : trading.reason}</p>
      </article>
    </div>

    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <h3 className="text-lg font-semibold">Deposit USDT</h3>
      {billing.deposit.enabled && address ? <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        {qr && <img src={qr} alt="Deposit address QR code" className="h-44 w-44 rounded-xl bg-white p-2" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-300">Send <strong>{billing.deposit.asset}</strong> on <strong>{billing.deposit.network}</strong> only.</p>
          <p className="mt-3 break-all rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 font-mono text-sm">{address}</p>
          <button type="button" onClick={() => void copyAddress()} className="mt-3 rounded-xl border border-white/10 px-4 py-2 text-sm">{copied ? 'Copied' : 'Copy address'}</button>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-400">
            <li>This address is yours alone. Deposits are credited automatically after network confirmations, usually within a few minutes.</li>
            <li>Sending another token or using another network (such as TRC20 or ERC20) will lose the funds.</li>
            <li>This balance only pays platform fees. Your trading capital stays in your own Binance account.</li>
          </ul>
        </div>
      </div> : <p className="mt-3 text-sm text-slate-400">Deposits are not available yet. Please contact support.</p>}
    </div>

    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <h3 className="text-lg font-semibold">History</h3>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="pb-3">Date</th><th>Type</th><th>Details</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.id} className="border-t border-white/10">
          <td className="py-3 text-slate-400">{new Date(entry.createdAt).toLocaleString()}</td>
          <td>{entryLabel[entry.type]}{entry.level ? ` · L${entry.level}` : ''}</td>
          <td className="text-slate-400">{entry.description ?? '—'}</td>
          <td className={`text-right ${entry.amountQuote >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{entry.amountQuote >= 0 ? '+' : ''}{entry.amountQuote.toFixed(2)}</td>
          <td className="text-right">{entry.balanceAfterQuote.toFixed(2)}</td>
        </tr>)}</tbody>
      </table>{entries.length === 0 && <p className="py-5 text-sm text-slate-500">No activity yet.</p>}</div>
    </div>

    <ConfirmDialog
      open={confirming}
      title={membership.active ? 'Extend membership?' : 'Activate membership?'}
      description={`${money(fees.membershipFeeQuote)} will be deducted from your balance for ${fees.membershipDays} days of membership${membership.active ? ', added after your current expiry date' : ''}.`}
      confirmLabel="Confirm"
      busy={busy}
      onCancel={() => setConfirming(false)}
      onConfirm={() => void activate()}
    />
  </section>;
}
