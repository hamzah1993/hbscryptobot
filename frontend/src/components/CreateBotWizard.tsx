import { useEffect, useMemo, useState } from 'react';
import { api, type CreateStrategyPayload, type TradingStrategy } from '../lib/api';

type Props = {
  token: string;
  onClose: () => void;
  onCreated: (strategy: TradingStrategy) => void;
};

type BotMode = 'PAPER' | 'TESTNET';

const initialForm: CreateStrategyPayload & { marketPrice: number; mode: BotMode } = {
  name: 'Testnet DCA Bot',
  symbol: '',
  environment: 'TESTNET',
  paperTrading: false,
  riskBudgetQuote: 1000,
  baseOrderQuote: 100,
  maxDcaOrders: 5,
  dcaStepPercent: 2,
  dcaMultiplier: 1.5,
  takeProfitPercent: 1.5,
  independentFromLevel: 5,
  marketPrice: 0,
  mode: 'TESTNET',
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
  const estimatedInitialQuantity = useMemo(
    () => form.marketPrice > 0 ? form.baseOrderQuote / form.marketPrice : 0,
    [form.baseOrderQuote, form.marketPrice],
  );

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

  function selectMode(mode: BotMode) {
    setForm((current) => ({
      ...current,
      mode,
      environment: 'TESTNET',
      paperTrading: mode === 'PAPER',
      name: current.name === 'Testnet DCA Bot' || current.name === 'Paper DCA Bot'
        ? mode === 'PAPER' ? 'Paper DCA Bot' : 'Testnet DCA Bot'
        : current.name,
    }));
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
    if (form.mode === 'TESTNET' && (!Number.isFinite(estimatedInitialQuantity) || estimatedInitialQuantity <= 0)) {
      setError('The initial Testnet quantity is invalid. Check the base order and market price.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { marketPrice, mode, ...payload } = form;
      const strategy = await api.createStrategy(token, {
        ...payload,
        environment: 'TESTNET',
        paperTrading: mode === 'PAPER',
      });

      if (mode === 'PAPER') {
        await api.openPaperPosition(token, strategy.id, marketPrice);
      } else {
        await api.setStrategyStatus(token, strategy.id, 'PAUSED');
        await api.executeTestnetOrder(token, strategy.id, {
          side: 'BUY',
          quantity: estimatedInitialQuantity,
        });
      }

      onCreated(strategy);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create bot');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-2 backdrop-blur-sm sm:p-4">
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-6">
        <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a1728] shadow-2xl shadow-black/40 sm:max-h-[calc(100dvh-3rem)] sm:rounded-3xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Create bot</p>
              <h2 className="mt-1 text-xl font-semibold sm:text-2xl">{form.mode === 'PAPER' ? 'Paper strategy setup' : 'Binance Testnet setup'}</h2>
            </div>
            <button onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300">Close</button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
              <button type="button" onClick={() => selectMode('PAPER')} className={`rounded-xl px-3 py-3 text-sm font-semibold ${form.mode === 'PAPER' ? 'bg-violet-400 text-slate-950' : 'text-slate-300'}`}>Paper bot</button>
              <button type="button" onClick={() => selectMode('TESTNET')} className={`rounded-xl px-3 py-3 text-sm font-semibold ${form.mode === 'TESTNET' ? 'bg-cyan-400 text-slate-950' : 'text-slate-300'}`}>Binance Testnet bot</button>
            </div>

            <div className="mb-6 grid grid-cols-3 gap-2 text-xs">
              {['Basics', 'Risk & DCA', 'Review'].map((label, index) => (
                <div key={label} className={`rounded-xl px-2 py-2 text-center sm:px-3 ${step === index + 1 ? 'bg-cyan-400 text-slate-950' : 'bg-white/[0.04] text-slate-400'}`}>
                  {index + 1}. {label}
                </div>
              ))}
            </div>

            {error && <div className="mb-5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}

            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">Bot name<input value={form.name} onChange={(event) => update('name', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-cyan-300/60" /></label>
                <label className="text-sm text-slate-300">
                  Symbol from available balance
                  <select disabled={loadingBalances || availableSymbols.length === 0} value={form.symbol} onChange={(event) => update('symbol', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101f32] px-4 py-3 disabled:opacity-50">
                    {loadingBalances && <option value="">Loading balances…</option>}
                    {!loadingBalances && availableSymbols.length === 0 && <option value="">No funded base assets</option>}
                    {availableSymbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                  </select>
                </label>
                <label className="text-sm text-slate-300 sm:col-span-2">
                  Entry price
                  <input type="number" min="0" step="any" value={form.marketPrice || ''} placeholder={loadingPrice ? 'Loading current market price…' : 'Current market price'} onChange={(event) => update('marketPrice', Number(event.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-cyan-300/60" />
                  <span className="mt-1 block text-xs text-slate-500">Loaded from Binance Testnet. Paper mode allows an override; Testnet mode uses it to preview quantity.</span>
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
                  <label key={key} className="text-sm text-slate-300">{label}<input type="number" min="0" step="any" value={form[key as keyof typeof form] as number} onChange={(event) => update(key as keyof typeof form, Number(event.target.value) as never)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-cyan-300/60" /></label>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Mode', form.mode === 'PAPER' ? 'Paper' : 'Binance Testnet'],
                    ['Strategy', form.name],
                    ['Symbol', form.symbol || 'Not available'],
                    ['Entry price', form.marketPrice ? `$${form.marketPrice}` : 'Unavailable'],
                    ['Risk budget', `$${form.riskBudgetQuote}`],
                    ['Base order', `$${form.baseOrderQuote}`],
                    ['Initial quantity', estimatedInitialQuantity ? estimatedInitialQuantity.toPrecision(8) : 'Unavailable'],
                    ['Planned levels', String(estimatedLevels)],
                    ['Take profit', `${form.takeProfitPercent}%`],
                  ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 break-all font-medium">{value}</p></div>)}
                </div>
                {form.mode === 'TESTNET' ? (
                  <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">Creating this bot will create a paused Binance Testnet strategy and immediately submit one Testnet BUY market order using the estimated quantity above. No Live-money order is permitted.</p>
                ) : (
                  <p className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-sm leading-6 text-violet-100">Creating this bot opens a simulated Paper position only. No Binance order is submitted.</p>
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 bg-[#0a1728] px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <button disabled={step === 1 || submitting} onClick={() => setStep((current) => current - 1)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm disabled:opacity-40">Back</button>
              {step < 3 ? (
                <button disabled={step === 1 && (loadingBalances || !form.symbol || loadingPrice || !form.marketPrice)} onClick={() => setStep((current) => current + 1)} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">Continue</button>
              ) : (
                <button disabled={submitting || !form.symbol || !form.marketPrice} onClick={submit} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60 ${form.mode === 'PAPER' ? 'bg-violet-400' : 'bg-emerald-400'}`}>{submitting ? 'Creating…' : form.mode === 'PAPER' ? 'Create paper bot' : 'Create Testnet bot & buy'}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
