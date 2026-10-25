import { useAuth } from '../auth/AuthContext';
import { api, type BalanceEntryType } from '../lib/api';
import { Card, Empty, ErrorNote, SubHeader, money, signed, usePolling } from './ui';

/** Realized results of the user's closed LIVE positions, newest first. */
export function ProfitScreen() {
  const { token } = useAuth();
  const { data, error } = usePolling(() => api.listLivePositions(token!, 250), 30_000);
  const closed = (data ?? []).filter((position) => position.status === 'CLOSED')
    .sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime());
  const total = closed.reduce((sum, position) => sum + Number(position.realizedPnlQuote), 0);
  const wins = closed.filter((position) => Number(position.realizedPnlQuote) > 0).length;

  return <>
    <SubHeader title="Profit Details" />
    <main className="space-y-3 px-3">
      <ErrorNote message={error} />
      <Card>
        <p className="text-sm text-slate-500">Total realized P&amp;L (LIVE)</p>
        <p className={`mt-1 text-2xl font-bold ${total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{signed(total)} USDT</p>
        <p className="mt-1 text-xs text-slate-400">{closed.length} closed trades · {wins} profitable · before platform fees</p>
      </Card>
      <Card className="p-0">
        {data && closed.length === 0 && <Empty>No closed trades yet.</Empty>}
        <ul className="divide-y divide-slate-100">
          {closed.map((position) => {
            const pnl = Number(position.realizedPnlQuote);
            return <li key={position.id} className="flex items-center justify-between px-4 py-3">
              <div><p className="font-medium">{position.symbol}</p><p className="text-xs text-slate-400">{position.closedAt ? new Date(position.closedAt).toLocaleString() : ''}</p></div>
              <p className={`font-semibold tabular-nums ${pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{signed(pnl, 4)}</p>
            </li>;
          })}
        </ul>
      </Card>
    </main>
  </>;
}

const rewardTypes: BalanceEntryType[] = ['REFERRAL_REWARD'];

/** Referral rewards credited to the user's balance. */
export function RewardScreen() {
  const { token } = useAuth();
  const { data, error } = usePolling(() => api.listBalanceEntries(token!, 500), 30_000);
  const rewards = (data ?? []).filter((entry) => rewardTypes.includes(entry.type));
  const total = rewards.reduce((sum, entry) => sum + entry.amountQuote, 0);

  return <>
    <SubHeader title="Reward Details" />
    <main className="space-y-3 px-3">
      <ErrorNote message={error} />
      <Card>
        <p className="text-sm text-slate-500">Total referral rewards</p>
        <p className="mt-1 text-2xl font-bold text-emerald-600">{money(total)}</p>
      </Card>
      <Card className="p-0">
        {data && rewards.length === 0 && <Empty>No rewards yet. Invite friends from the Team tab.</Empty>}
        <ul className="divide-y divide-slate-100">
          {rewards.map((entry) => <li key={entry.id} className="flex items-center justify-between px-4 py-3">
            <div><p className="font-medium">Level {entry.level} reward</p><p className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</p></div>
            <p className="font-semibold text-emerald-600">+{entry.amountQuote.toFixed(2)}</p>
          </li>)}
        </ul>
      </Card>
    </main>
  </>;
}

const steps = [
  { title: 'Create a Binance API key', body: 'In Binance, create an API key with Spot trading enabled and withdrawals disabled. Restrict it to trusted IPs if you can.' },
  { title: 'Bind it under API Binding', body: 'Paste the key and secret for Binance LIVE. Keys are encrypted and only used to place your trades.' },
  { title: 'Deposit fuel and activate membership', body: 'Send USDT (BEP20) to your deposit address under Assets, then activate your membership.' },
  { title: 'Subscribe to a package', body: 'Pick a package under Strategy. Keep at least the package amount of USDT in your Binance spot wallet.' },
  { title: 'Confirm and start', body: 'Confirm LIVE trading under Assets, then press Start on your package. You can stop at any time.' },
  { title: 'Fees', body: 'A yearly membership plus a share of the profit on each profitable trade, paid from your fuel balance. Losing trades are not charged.' },
  { title: 'Risks', body: 'Crypto trading can lose money, including during strong market moves. Only trade with funds you can afford to lose.' },
];

export function GuideScreen() {
  return <>
    <SubHeader title="User Guide" />
    <main className="space-y-3 px-3">
      {steps.map((step, index) => <Card key={step.title}>
        <div className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-50 text-sm font-semibold text-teal-700">{index + 1}</span>
          <div><h2 className="font-semibold">{step.title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{step.body}</p></div>
        </div>
      </Card>)}
    </main>
  </>;
}
