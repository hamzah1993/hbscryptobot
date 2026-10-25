import QRCode from 'qrcode';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import { Card, ConfirmSheet, ErrorNote, PrimaryButton, SecondaryButton, SubHeader, money, usePolling } from './ui';

export function AssetsScreen() {
  const { token } = useAuth();
  const { data, error, refresh } = usePolling(async () => {
    const [billing, safety] = await Promise.all([api.getBilling(token!), api.getLiveTradingSafety(token!)]);
    return { billing, safety };
  }, 20_000);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmMembership, setConfirmMembership] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const address = data?.billing.deposit.address ?? null;
  useEffect(() => {
    if (!address) { setQr(null); return; }
    QRCode.toDataURL(address, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(null));
  }, [address]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setActionError(null);
    try { await action(); await refresh(); }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : 'Request failed'); }
    finally { setBusy(false); }
  }

  if (!data) return <><SubHeader title="Assets" /><main className="px-3"><ErrorNote message={error} /></main></>;
  const { billing, safety } = data;
  const canAfford = billing.balanceQuote >= billing.fees.membershipFeeQuote;
  const liveConfirmed = Boolean(safety.confirmedAt);

  return <>
    <SubHeader title="Assets" />
    <main className="space-y-3 px-3">
      <ErrorNote message={actionError} />
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Fuel balance</p>
        <p className={`mt-2 text-3xl font-bold ${billing.balanceQuote < 0 ? 'text-rose-300' : ''}`}>{money(billing.balanceQuote)}</p>
        <p className="mt-2 text-xs leading-5 text-white/70">Pays your membership and the {billing.fees.profitFeePercent}% fee on each profitable trade. Keep at least {money(billing.fees.minBalanceQuote)} to keep trading.</p>
      </section>

      <Card>
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-slate-500">Membership</p><p className={`text-lg font-semibold ${billing.membership.active ? 'text-emerald-600' : 'text-amber-600'}`}>{billing.membership.active ? 'Active' : 'Inactive'}</p></div>
          <p className="text-right text-xs text-slate-400">{billing.membership.active && billing.membership.expiresAt ? `Until ${new Date(billing.membership.expiresAt).toLocaleDateString()}` : `${money(billing.fees.membershipFeeQuote)} / ${billing.fees.membershipDays} days`}</p>
        </div>
        <PrimaryButton disabled={busy || !canAfford} onClick={() => setConfirmMembership(true)} className="mt-3 w-full">{billing.membership.active ? 'Extend membership' : 'Activate membership'}</PrimaryButton>
        {!canAfford && <p className="mt-2 text-xs text-slate-400">Deposit at least {money(billing.fees.membershipFeeQuote - Math.max(billing.balanceQuote, 0))} more first.</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div><p className="text-sm text-slate-500">LIVE trading</p><p className={`text-lg font-semibold ${billing.trading.allowed && liveConfirmed ? 'text-emerald-600' : 'text-amber-600'}`}>{billing.trading.allowed && liveConfirmed ? 'Ready' : 'Not ready'}</p></div>
          <p className="text-right text-xs text-slate-400">Limit {safety.capitalCeilingQuote ? money(safety.capitalCeilingQuote) : 'not set'}</p>
        </div>
        {!billing.trading.allowed && <p className="mt-2 text-sm text-slate-500">{billing.trading.reason}</p>}
        {!liveConfirmed && safety.capitalCeilingQuote && <div className="mt-3">
          <p className="text-sm text-slate-500">Type the phrase below to confirm you understand LIVE trading uses real money:</p>
          <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs">{safety.confirmationPhrase}</p>
          <input value={phrase} onChange={(event) => setPhrase(event.target.value)} placeholder="Type the phrase" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500" />
          <PrimaryButton disabled={busy || phrase.trim() !== safety.confirmationPhrase} onClick={() => void run(async () => { await api.confirmLiveTrading(token!, phrase); setPhrase(''); })} className="mt-2 w-full">Confirm LIVE trading</PrimaryButton>
        </div>}
        {!safety.capitalCeilingQuote && <p className="mt-2 text-sm text-slate-500">Subscribe to a package to set your LIVE limit.</p>}
      </Card>

      <Card>
        <h2 className="font-semibold">Deposit USDT</h2>
        {billing.deposit.enabled && address ? <>
          <p className="mt-1 text-sm text-slate-500">Send <strong>USDT</strong> on <strong>{billing.deposit.network}</strong> only.</p>
          {qr && <img src={qr} alt="Deposit address QR code" className="mx-auto mt-4 h-44 w-44 rounded-xl border border-slate-100" />}
          <p className="mt-4 break-all rounded-xl bg-slate-100 px-3 py-3 text-center font-mono text-xs">{address}</p>
          <SecondaryButton onClick={() => void navigator.clipboard.writeText(address).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => undefined)} className="mt-2 flex w-full items-center justify-center gap-1.5"><Copy className="h-4 w-4" />{copied ? 'Copied' : 'Copy address'}</SecondaryButton>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-400">
            <li>Credited automatically after network confirmations, usually within minutes.</li>
            <li>Other tokens or networks (TRC20, ERC20) will be lost.</li>
            <li>This balance only pays platform fees. Trading funds stay on your Binance account.</li>
          </ul>
        </> : <p className="mt-2 text-sm text-slate-500">Deposits are not available yet. Please contact support.</p>}
      </Card>
    </main>
    <ConfirmSheet
      open={confirmMembership}
      title={billing.membership.active ? 'Extend membership?' : 'Activate membership?'}
      message={`${money(billing.fees.membershipFeeQuote)} will be deducted from your balance for ${billing.fees.membershipDays} days${billing.membership.active ? ', added after your current expiry date' : ''}.`}
      confirmLabel="Confirm"
      busy={busy}
      onCancel={() => setConfirmMembership(false)}
      onConfirm={() => void run(async () => { await api.activateMembership(token!); setConfirmMembership(false); })}
    />
  </>;
}
