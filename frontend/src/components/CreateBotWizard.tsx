import { useEffect, useMemo, useState } from 'react';
import { api, type CreateStrategyPayload, type TradingStrategy } from '../lib/api';

type Props = {
  token: string;
  onClose: () => void;
  onCreated: (strategy: TradingStrategy) => void;
};

const initialForm: CreateStrategyPayload & { marketPrice: number } = {
  name: 'Testnet DCA Bot',
  symbol: '',
  environment: 'TESTNET',
  paperTrading: true,
  riskBudgetQuote: 1000,
  baseOrderQuote: 100,
  maxDcaOrders: 5,
  dcaStepPercent: 2,
  dcaMultiplier: 1.5,
  takeProfitPercent: 1.5,
  independentFromLevel: 5,
  marketPrice: 0,
};

const quoteAssets = new Set(['USDT', 'USDC', 'BUSD', 'FDUSD']);

export function CreateBotWizard({ token, onClose, onCreated }: Props) {
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [loadingPrice, setLoadingPrice] = useState(false);

  const estimatedLevels = useMemo(() => form.maxDcaOrders + 1, [form.maxDcaOrders]);

  useEffect(() => {
    let cancelled = false;
    setLoadingBalances(true);
    api.getBinanceTestnetBalances(token)
      .then((result) => {
        if (cancelled) return;
        const symbols = result.balances
          .filter((balance) => balance.free + balance.locked > 0 && !quoteAssets.has(balance.asset))
          .map((balance) => `${balance.asset.toUpperCase()}USDT`)
          .filter((symbol, index, all) => all.indexOf(symbol) === index)
          .sort();
        setAvailableSymbols(symbols);
        setForm((current) => ({ ...current, symbol: current.symbol || symbols[0] || '' }));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load Testnet balances');
      })
      .finally(() => {
        if (!cancelled) setLoadingBalances(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!form.symbol) return;
    let cancelled = false;
    setLoadingPrice(true);
    setError(null);
    api.getMarketCandles(token, form.symbol, '1m', 2, 'testnet')
      .then((result) => {
        if (cancelled) return;
        const latest = result.candles[result.candles.length - 1];
        if (latest?.close && Number.isFinite(latest.close)) {
          setForm((current) => ({ ...current, marketPrice: latest.close }));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load current market price');
      })
      .finally(() => {
        if (!cancelled) setLoadingPrice(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, form.symbol]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!form.symbol) {
      setError('No tradeable Testnet balance is available. Fund a base asset such as BTC, ETH, BNB, or SOL first.');
      return;
    }
    if (!form.marketPrice || form.marketPrice <= 0) {
      setError('A valid current market price is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { marketPrice, ...payload } = form;
      const strategy = await api.createStrategy(token, payload);
      await api.openPaperPosition(token, strategy.id, marketPrice);
      onCreated(strategy);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create bot');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#0a1728] shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Create bot</p>
            <h2 className="mt-1 text-2xl font-semibold">Paper strategy setup</h2>
          </div>
          <button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300">Close</button>
        </div>

        <div className="px-6 py-5">
          <div className="mb-6 grid grid-cols-3 gap-2 text-xs">
            {['Basics', 'Risk & DCA', 'Review'].map((label, index) => (
              <div key={label} className={`rounded-xl px-3 py-2 text-center ${step === index + 1 ? 'bg-cyan-400 text-slate-950' : 'bg-white/[0.04] text-slate-400'}`}>
                {index + 1}. {label}
              </div>
            ))}
          </div>

          {error && <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Bot name<input value={form.name} onChange={(e) => update('name', e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-cyan-300/60" /></label>
              <label className="text-sm text-slate-300">
                Symbol from available balance
                <select disabled={loadingBalances || availableSymbols.length === 0} value={form.symbol} onChange={(e) => update('symbol', e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101f32] px-4 py-3 disabled:opacity-50">
                  {loadingBalances && <option value="">Loading balances…</option>}
                  {!loadingBalances && availableSymbols.length === 0 && <option value="">No funded base assets</option>}
                  {availableSymbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                </select>
              </label>
              <label className="text-sm text-slate-300">Environment<select value={form.environment} onChange={(e) => update('environment', e.target.value as 'TESTNET' | 'LIVE')} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101f32] px-4 py-3"><option value="TESTNET">Testnet</option><option value="LIVE">Live market data</option></select></label>
              <label className="text-sm text-slate-300">
                Entry price
                <input type="number" min="0" step="any" value={form.marketPrice || ''} placeholder={loadingPrice ? 'Loading current market price…' : 'Current market price'} onChange={(e) => update('marketPrice', Number(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-cyan-300/60" />
                <span className="mt-1 block text-xs text-slate-500">Automatically filled from the latest Binance Testnet candle. You can override it for paper simulation.</span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['riskBudgetQuote', 'Risk budget (USDT)'],
                ['baseOrderQuote', 'Base order (USDT)'],
                ['maxDcaOrders', 'Maximum DCA orders'],
                ['dcaStepPercent', 'DCA step (%)'],
                ['dcaMultiplier', 'DCA multiplier'],
                ['takeProfitPercent', 'Take profit (%)'],
                ['independentFromLevel', 'Independent from level'],
              ].map(([key, label]) => (
                <label key={key} className="text-sm text-slate-300">{label}<input type="number" min="0" step="any" value={form[key as keyof typeof form] as number} onChange={(e) => update(key as keyof typeof form, Number(e.target.value) as never)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-cyan-300/60" /></label>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Strategy', form.name],
                  ['Symbol', form.symbol || 'Not available'],
                  ['Entry price', form.marketPrice ? `$${form.marketPrice}` : 'Unavailable'],
                  ['Risk budget', `$${form.riskBudgetQuote}`],
                  ['Base order', `$${form.baseOrderQuote}`],
                  ['Planned levels', String(estimatedLevels)],
                  ['Take profit', `${form.takeProfitPercent}%`],
                ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 font-medium">{value}</p></div>)}
              </div>
              <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">The symbol comes from your funded Binance Testnet base assets, and the entry price is loaded automatically from the current market.</p>
            </div>
          )}

          <div className="mt-7 flex items-center justify-between">
            <button disabled={step === 1 || submitting} onClick={() => setStep((current) => current - 1)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-40">Back</button>
            {step < 3 ? (
              <button disabled={step === 1 && (loadingBalances || !form.symbol || loadingPrice || !form.marketPrice)} onClick={() => setStep((current) => current + 1)} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Continue</button>
            ) : (
              <button disabled={submitting || !form.symbol || !form.marketPrice} onClick={submit} className="rounded-xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">{submitting ? 'Creating…' : 'Create paper bot'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
