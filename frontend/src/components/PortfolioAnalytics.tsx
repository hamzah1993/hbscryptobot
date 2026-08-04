import type { TradingPosition } from '../lib/api';

type PortfolioAnalyticsProps = {
  positions: TradingPosition[];
  loading?: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function PortfolioAnalytics({ positions, loading = false }: PortfolioAnalyticsProps) {
  const closedPositions = positions.filter((position) => position.status === 'CLOSED');
  const profitablePositions = closedPositions.filter((position) => Number(position.realizedPnlQuote) > 0);
  const realizedPnl = positions.reduce((sum, position) => sum + Number(position.realizedPnlQuote), 0);
  const allocatedCapital = positions
    .filter((position) => position.status === 'OPEN')
    .reduce((sum, position) => sum + Number(position.totalCostQuote), 0);
  const totalDcaOrders = positions.reduce((sum, position) => sum + position.dcaCount, 0);
  const totalIndependentLegs = positions.reduce(
    (sum, position) => sum + (position.subPositions?.length ?? 0),
    0,
  );
  const winRate = closedPositions.length > 0
    ? (profitablePositions.length / closedPositions.length) * 100
    : 0;
  const returnOnAllocatedCapital = allocatedCapital > 0
    ? (realizedPnl / allocatedCapital) * 100
    : 0;

  const metrics = [
    {
      label: 'Portfolio return',
      value: percent(returnOnAllocatedCapital),
      helper: 'Realized P&L ÷ currently allocated capital',
      tone: returnOnAllocatedCapital >= 0 ? 'text-emerald-300' : 'text-rose-300',
    },
    {
      label: 'Win rate',
      value: percent(winRate),
      helper: `${profitablePositions.length} profitable of ${closedPositions.length} closed`,
      tone: 'text-cyan-300',
    },
    {
      label: 'DCA activity',
      value: String(totalDcaOrders),
      helper: 'Completed parent-position DCA entries',
      tone: 'text-violet-300',
    },
    {
      label: 'Independent legs',
      value: String(totalIndependentLegs),
      helper: 'Royal Q-style sub-positions created',
      tone: 'text-amber-300',
    },
  ];

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Performance</p>
          <h3 className="mt-2 text-lg font-semibold">Portfolio analytics</h3>
          <p className="mt-1 text-sm text-slate-400">A clear snapshot of realized results and strategy activity.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-950/25 px-4 py-3 text-right">
          <p className="text-xs text-slate-500">Realized P&L</p>
          <p className={`mt-1 text-lg font-semibold ${realizedPnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {loading ? '—' : money(realizedPnl)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-2xl border border-white/10 bg-slate-950/25 p-5">
            <p className="text-sm text-slate-400">{metric.label}</p>
            <p className={`mt-3 text-2xl font-semibold ${metric.tone}`}>{loading ? '—' : metric.value}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{metric.helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
