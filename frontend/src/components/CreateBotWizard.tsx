import { useEffect, useMemo, useState } from 'react';
import { api, type CreateStrategyPayload, type TestnetOrderPreview, type TradingStrategy } from '../lib/api';

type Props = {
  token: string;
  defaultMode?: BotMode;
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

export function CreateBotWizard({ token, defaultMode = 'TESTNET', onClose, onCreated }: Props) {
  const [form, setForm] = useState(() => ({
    ...initialForm,
    mode: defaultMode,
    paperTrading: defaultMode === 'PAPER',
    name: defaultMode === 'PAPER' ? 'Paper DCA Bot' : 'Testnet DCA Bot',
  }));
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [preview, setPreview] = useState<TestnetOrderPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [existingNames, setExistingNames] = useState<string[]>([]);

  const estimatedLevels = useMemo(() => form.maxDcaOrders + 1, [form.maxDcaOrders]);
  const estimatedInitialQuantity = useMemo(
    () => form.marketPrice > 0 ? form.baseOrderQuote / form.marketPrice : 0,
    [form.baseOrderQuote, form.marketPrice],
  );
  const duplicateName = useMemo(() => {
    const normalized = form.name.trim().toLowerCase();
    return normalized.length > 0 && existingNames.some((name) => name.trim().toLowerCase() === normalized);
  }, [existingNames, form.name]);

  useEffect(() => {
    let cancelled = false;
    api.listStrategies(token)
      .then((strategies) => {
        if (!cancelled) setExistingNames(strategies.map((strategy) => strategy.name));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [token]);

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
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!form.symbol) return;
    let cancelled = false;
    setLoadingPrice(true);
    setPreview(null);
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
    return () => { cancelled = true; };
  }, [token, form.symbol]);

  useEffect(() => {
    setPreview(null);
  }, [form.mode, form.symbol, form.baseOrderQuote]);

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
    setPreview(null);
  }

  async function loadPreview() {
    if (form.mode !== 'TESTNET') return;
    setPreviewing(true);
    setError(null);
    try {
      const result = await api.previewTestnetOrder(token, {
        symbol: form.symbol,
        quoteAmount: form.baseOrderQuote,
      });
      setPreview(result);
      setForm((current) => ({ ...current, marketPrice: result.marketPrice }));
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : 'Unable to validate Testnet order');
    } finally {
      setPreviewing(false);
    }
  }

  async function goNext() {
    if (!form.name.trim()) {
      setError('Bot name is required.');
      return;
    }
    if (duplicateName) {
      setError(`You already have a bot named “${form.name.trim()}”. Choose another name or edit the existing bot.`);
      return;
    }
    if (step === 2 && form.mode === 'TESTNET') {
      try {
        setPreviewing(true);
        setError(null);
        const result = await api.previewTestnetOrder(token, {
          symbol: form.symbol,
          quoteAmount: form.baseOrderQuote,
        });
        setPreview(result);
        setForm((current) => ({ ...current, marketPrice: result.marketPrice }));
        setStep(3);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to validate Testnet order');
      } finally {
        setPreviewing(false);
      }
      return;
    }
    setStep((current) => current + 1);
  }

  async function submit() {
    if (!form.name.trim()) {
      setError('Bot name is required.');
      return;
    }
    if (duplicateName) {
      setError(`You already have a bot named “${form.name.trim()}”. Choose another name or edit the existing bot.`);
      return;
    }
    if (!form.symbol) {
      setError('No tradeable Testnet balance is available. Fund a base asset such as BTC, ETH, BNB, or SOL first.');
      return;
    }
    if (!form.marketPrice || form.marketPrice <= 0) {
      setError('A valid current market price is required.');
      return;
    }
    if (form.mode === 'TESTNET' && !preview) {
      setError('Refresh and confirm the Binance Testnet order preview before creating the bot.');
      return;
    }

    setSubmitting(true);
    setError(null);
    let strategy: TradingStrategy | null = null;
    try {
      const { marketPrice, mode, ...payload } = form;
      strategy = await api.createStrategy(token, {
        ...payload,
        name: payload.name.trim(),
        environment: 'TESTNET',
        paperTrading: mode === 'PAPER',
      });

      if (mode === 'PAPER') {
        await api.openPaperPosition(token, strategy.id, marketPrice);
      } else {
        await api.setStrategyStatus(token, strategy.id, 'PAUSED');
        await api.executeTestnetOrder(token, strategy.id, {
          side: 'BUY',
          quantity: Number(preview?.normalizedQuantity ?? 0),
        });
      }

      onCreated(strategy);
    } catch (reason) {
      if (strategy && form.mode === 'TESTNET') {
        await api.deleteStrategy(token, strategy.id).catch(() => undefined);
      }
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
                <label className="text-sm text-slate-300">
                  Bot name
                  <input value={form.name} onChange={(event) => update('name', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 outline-none focus:border-cyan-300/60" />
                  {duplicateName && <span className="mt-1 block text-xs text-rose-300">A bot with this name already exists.</span>}
                </label>
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
                  <span className="mt-1 block text-xs text-slate-500">Loaded from Binance Testnet. Paper mode allows an override; Testnet mode is revalidated before order submission.</span>
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
                    ['Market price', `$${preview?.marketPrice ?? form.marketPrice}`],
                    ['Risk budget', `$${form.riskBudgetQuote}`],
                    ['Base order', `$${form.baseOrderQuote}`],
                    ['Initial quantity', form.mode === 'TESTNET' ? preview?.normalizedQuantity ?? 'Preview required' : estimatedInitialQuantity.toPrecision(8)],
                    ['Planned levels', String(estimatedLevels)],
                    ['Take profit', `${form.takeProfitPercent}%`],
                  ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 break-all font-medium">{value}</p></div>)}
                </div>

                {form.mode === 'TESTNET' && preview && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <PreviewMetric label={`Available ${preview.quoteAsset}`} value={preview.availableQuote} />
                    <PreviewMetric label="Estimated spend" value={preview.estimatedSpend} />
                    <PreviewMetric label={`Remaining ${preview.quoteAsset}`} value={preview.remainingQuote} />
                    <PreviewMetric label="Minimum notional" value={preview.minNotional} />
                    <PreviewMetric label="Quantity filter" value={preview.quantityFilterType} raw />
                    <PreviewMetric label="Step size" value={preview.stepSize} raw />
                    <PreviewMetric label="Minimum quantity" value={preview.minQuantity} />
                    <PreviewMetric label="Maximum quantity" value={preview.maxQuantity > 0 ? preview.maxQuantity : 'No separate maximum'} raw />
                  </div>
                )}

                {form.mode === 'TESTNET' ? (
                  <div className="space-y-3">
                    <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">Creating this bot submits one Binance Testnet BUY market order using the exchange-normalized quantity. Live-money execution remains disabled.</p>
                    <button type="button" onClick={() => void loadPreview()} disabled={previewing} className="w-full rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-200 disabled:opacity-50">{previewing ? 'Validating Binance filters…' : 'Refresh Testnet order preview'}</button>
                  </div>
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
                <button disabled={previewing || duplicateName || !form.name.trim() || (step === 1 && (loadingBalances || !form.symbol || loadingPrice || !form.marketPrice))} onClick={() => void goNext()} className="rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50">{previewing ? 'Validating…' : 'Continue'}</button>
              ) : (
                <button disabled={submitting || duplicateName || !form.name.trim() || !form.symbol || !form.marketPrice || (form.mode === 'TESTNET' && !preview)} onClick={submit} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60 ${form.mode === 'PAPER' ? 'bg-violet-400' : 'bg-emerald-400'}`}>{submitting ? 'Creating…' : form.mode === 'PAPER' ? 'Create paper bot' : 'Confirm Testnet bot & buy'}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({ label, value, raw = false }: { label: string; value: number | string; raw?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-all font-medium">{raw ? String(value) : Number(value).toLocaleString(undefined, { maximumFractionDigits: 8 })}</p>
    </div>
  );
}
