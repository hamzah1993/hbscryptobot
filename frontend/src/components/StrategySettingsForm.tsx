import type { PackageStrategySettings, StrategyBacktestResult, StrategyBacktestSummary, StrategyField } from '../lib/api';

/** Form values: numbers and lists are kept as the text the admin typed until saved. */
export type StrategyFormValues = Record<string, string | boolean>;

const input = 'mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-400/40';

export function isFieldVisible(field: StrategyField, values: StrategyFormValues) {
  return !field.showWhen?.length || field.showWhen.some((condition) => condition.values.includes(values[condition.key] as string | boolean));
}

export function toFormValues(fields: StrategyField[], settings: PackageStrategySettings = {}): StrategyFormValues {
  const values: StrategyFormValues = {};
  for (const field of fields) {
    const raw = settings[field.key] !== undefined ? settings[field.key] : field.default;
    if (field.type === 'boolean') values[field.key] = Boolean(raw);
    else if (field.type === 'numberList') values[field.key] = Array.isArray(raw) ? raw.join(', ') : '';
    else values[field.key] = raw === null || raw === undefined ? '' : String(raw);
  }
  return values;
}

/** Builds the settings object from visible fields; hidden fields fall back to server defaults. */
export function toSettings(fields: StrategyField[], values: StrategyFormValues): { settings: PackageStrategySettings; error: string | null } {
  const settings: PackageStrategySettings = {};
  for (const field of fields) {
    if (!isFieldVisible(field, values)) continue;
    const value = values[field.key];
    if (field.type === 'boolean') { settings[field.key] = Boolean(value); continue; }
    if (field.type === 'select') { settings[field.key] = String(value); continue; }
    const text = String(value ?? '').trim();
    if (field.type === 'numberList') {
      if (!text) continue;
      const list = text.split(/[,\s]+/).filter(Boolean).map(Number);
      if (list.some((item) => !Number.isFinite(item))) return { settings, error: `${field.label}: enter numbers separated by commas` };
      settings[field.key] = list;
      continue;
    }
    if (!text) {
      if (field.required) return { settings, error: `${field.label} is required` };
      if (field.nullable) settings[field.key] = null;
      continue;
    }
    const number = Number(text);
    if (!Number.isFinite(number) || (field.type === 'integer' && !Number.isInteger(number))) {
      return { settings, error: `${field.label} must be ${field.type === 'integer' ? 'a whole number' : 'a number'}` };
    }
    settings[field.key] = number;
  }
  return { settings, error: null };
}

function rangeHint(field: StrategyField) {
  if (field.min !== undefined && field.max !== undefined) return ` Range: ${field.min}–${field.max}.`;
  if (field.min !== undefined) return ` Minimum: ${field.min}.`;
  if (field.max !== undefined) return ` Maximum: ${field.max}.`;
  return '';
}

/** Renders every strategy setting from the server's field definitions, grouped and with help text. */
export function StrategySettingsForm({ fields, values, onChange }: { fields: StrategyField[]; values: StrategyFormValues; onChange: (next: StrategyFormValues) => void }) {
  const groups = [...new Set(fields.map((field) => field.group))];
  return <div className="space-y-5">
    {groups.map((group) => {
      const visible = fields.filter((field) => field.group === group && isFieldVisible(field, values));
      if (!visible.length) return null;
      return <fieldset key={group}>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{group}</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((field) => <label key={field.key} className={`block text-sm text-slate-300 ${field.type === 'boolean' ? 'self-center' : ''}`}>
            {field.type === 'boolean'
              ? <span className="flex items-center gap-2"><input type="checkbox" checked={Boolean(values[field.key])} onChange={(event) => onChange({ ...values, [field.key]: event.target.checked })} />{field.label}</span>
              : <span>{field.label}{field.unit ? <span className="text-slate-500"> ({field.unit})</span> : null}{field.required ? <span className="text-rose-300"> *</span> : null}</span>}
            {field.type === 'select' && <select value={String(values[field.key])} onChange={(event) => onChange({ ...values, [field.key]: event.target.value })} className={input}>
              {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>}
            {(field.type === 'number' || field.type === 'integer') && <input type="number" value={String(values[field.key] ?? '')} min={field.min} max={field.max} step={field.step ?? (field.type === 'integer' ? 1 : 'any')}
              placeholder={field.nullable ? 'Off' : undefined} onChange={(event) => onChange({ ...values, [field.key]: event.target.value })} className={input} />}
            {field.type === 'numberList' && <input value={String(values[field.key] ?? '')} placeholder="e.g. 1, 1.5, 2" onChange={(event) => onChange({ ...values, [field.key]: event.target.value })} className={input} />}
            <span className="mt-1 block text-xs leading-5 text-slate-500">{field.help}{rangeHint(field)}</span>
          </label>)}
        </div>
      </fieldset>;
    })}
  </div>;
}

const pct = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

/** Side-by-side backtest results: the strategy as configured vs. the same settings without entry rules. */
export function BacktestResultTable({ result }: { result: StrategyBacktestResult }) {
  const rows: Array<[string, (summary: StrategyBacktestSummary) => string]> = [
    ['Return', (summary) => pct(summary.returnPercent)],
    ['Profit (USDT)', (summary) => summary.profitQuote.toFixed(2)],
    ['Max drawdown', (summary) => `${summary.maxDrawdownPercent.toFixed(2)}%`],
    ['Completed cycles', (summary) => String(summary.cycles)],
    ['Stop-losses', (summary) => String(summary.stopLosses)],
    ['Profitable exits', (summary) => `${summary.profitableExitPercent.toFixed(0)}%`],
    ['Trades', (summary) => String(summary.trades)],
  ];
  return <div className="mt-3">
    <p className="text-xs text-slate-400">
      {result.symbol} · {result.interval} · {new Date(result.from).toLocaleDateString()} – {new Date(result.to).toLocaleDateString()} · {result.candles.toLocaleString()} candles ·
      {' '}{result.capitalQuote} USDT capital · {result.feePercent}% fee per trade · market {pct(result.marketChangePercent)}
    </p>
    <table className="mt-2 w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="py-2" /><th>This strategy</th>{result.withoutEntryRules && <th>Without entry rules</th>}</tr></thead>
      <tbody>{rows.map(([label, value]) => <tr key={label} className="border-t border-white/10">
        <td className="py-2 text-slate-400">{label}</td>
        <td className="font-semibold">{value(result.strategy)}</td>
        {result.withoutEntryRules && <td className="text-slate-300">{value(result.withoutEntryRules)}</td>}
      </tr>)}</tbody>
    </table>
    <p className="mt-2 text-xs text-slate-500">Simulated on candle closes. Cooldown and the daily loss stop are not simulated. Past results do not guarantee future returns.</p>
  </div>;
}
