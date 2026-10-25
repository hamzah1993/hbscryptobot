import { BadRequestException } from '@nestjs/common';
import { CONFIRM_RULES, CONFIRM_TIMEFRAMES, ENTRY_MODES } from '../trading/entry-signal';
import type { StrategyInput } from '../trading/strategy.service';

/**
 * Every strategy setting an admin can preset, described once. The admin panel
 * renders its form from this list (GET …/package-strategies/fields) and
 * sanitizePackageTemplate() type-checks stored templates against it, so a new
 * setting only needs a line here. Ranges are enforced by StrategyService.
 *
 * Identity, exchange, environment and capital fields are deliberately absent:
 * every package strategy is Binance LIVE and its budget comes from the package.
 */
export type StrategyFieldType = 'number' | 'integer' | 'boolean' | 'select' | 'numberList';

export type StrategyField = {
  key: keyof StrategyInput;
  label: string;
  group: 'Entry' | 'Orders' | 'Exit' | 'Sub-positions' | 'Recovery' | 'Limits';
  type: StrategyFieldType;
  required?: boolean;
  nullable?: boolean;
  default?: number | boolean | string | number[] | null;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: Array<{ value: string; label: string }>;
  /** Show the field only when any of these conditions holds (another field has one of the listed values). */
  showWhen?: ReadonlyArray<{ key: keyof StrategyInput; values: ReadonlyArray<string | boolean> }>;
  help: string;
};

const dip = [{ key: 'entryMode', values: ['DIP_CONFIRMATION'] }] as const;
/** Candle settings matter for dip entries and for DCA buys that wait for a bounce. */
const usesCandles = [...dip, { key: 'dcaRequiresConfirmation', values: [true] }] as const;
const recovery = [{ key: 'recoveryEnabled', values: [true] }] as const;

export const STRATEGY_FIELDS: StrategyField[] = [
  { key: 'entryMode', label: 'Entry mode', group: 'Entry', type: 'select', default: 'IMMEDIATE',
    options: [{ value: 'IMMEDIATE', label: 'Buy immediately' }, { value: 'DIP_CONFIRMATION', label: 'Wait for dip + bounce candle' }],
    help: 'When the bot opens a new cycle.' },
  { key: 'dipPercent', label: 'Dip size', group: 'Entry', type: 'number', default: 3, min: 0.1, max: 50, step: 0.1, unit: '%', showWhen: dip,
    help: 'How far below the recent high the price must drop before the bot looks for a bounce.' },
  { key: 'dipLookbackMinutes', label: 'Recent high window', group: 'Entry', type: 'integer', default: 1440, min: 5, step: 5, unit: 'min', showWhen: dip,
    help: 'The "recent high" is the highest price in this many minutes (1440 = 24 hours).' },
  { key: 'confirmTimeframe', label: 'Candle timeframe', group: 'Entry', type: 'select', default: '5m',
    options: CONFIRM_TIMEFRAMES.map((value) => ({ value, label: value })), showWhen: usesCandles,
    help: 'Candle size used for the dip and the bounce confirmation. Backtest on the same interval.' },
  { key: 'confirmRule', label: 'Bounce confirmation', group: 'Entry', type: 'select', default: 'CLOSE_ABOVE_PREV_HIGH',
    options: [
      { value: 'GREEN_CLOSE', label: 'One green candle' },
      { value: 'CLOSE_ABOVE_PREV_HIGH', label: 'Green candle closing above previous high' },
      { value: 'CONSECUTIVE_GREEN', label: 'Several green candles in a row' },
    ], showWhen: usesCandles, help: 'Only closed candles count; a candle still forming is ignored.' },
  { key: 'confirmCandles', label: 'Green candles in a row', group: 'Entry', type: 'integer', default: 2, min: 1, max: 5,
    showWhen: [{ key: 'confirmRule', values: ['CONSECUTIVE_GREEN'] }], help: 'Used with "Several green candles in a row".' },
  { key: 'rsiMax', label: 'RSI filter (optional)', group: 'Entry', type: 'number', nullable: true, default: null, min: 5, max: 60, step: 1, showWhen: usesCandles,
    help: 'If set, RSI(14) must have dipped to this value or below just before the bounce. 30 = oversold. Leave empty to disable.' },
  { key: 'dcaRequiresConfirmation', label: 'DCA waits for bounce candle', group: 'Entry', type: 'boolean', default: false,
    help: 'Extra DCA and recovery buys also wait for the bounce confirmation instead of buying as soon as the level is hit.' },

  { key: 'baseOrderQuote', label: 'First buy', group: 'Orders', type: 'number', required: true, default: 10, min: 5, step: 0.5, unit: 'USDT',
    help: 'Size of the first buy of each cycle. Binance requires at least 5 USDT.' },
  { key: 'maxDcaOrders', label: 'DCA levels', group: 'Orders', type: 'integer', required: true, default: 3, min: 3, max: 5,
    help: 'Maximum number of extra buys if the price keeps falling.' },
  { key: 'dcaStepPercent', label: 'DCA step', group: 'Orders', type: 'number', required: true, default: 3, min: 3, max: 15, step: 0.1, unit: '%',
    help: 'Price drop from the last buy that triggers the next DCA buy.' },
  { key: 'dcaMultiplier', label: 'DCA multiplier', group: 'Orders', type: 'number', required: true, default: 1, min: 1, step: 0.1, unit: '×',
    help: 'Fallback size growth per DCA level when no per-level multipliers are set.' },
  { key: 'dcaMultipliers', label: 'Per-level multipliers', group: 'Orders', type: 'numberList', default: [1, 1.5, 2],
    help: 'Size of each DCA buy as a multiple of the first buy, one per level (e.g. 1, 1.5, 2).' },

  { key: 'takeProfitPercent', label: 'Take profit', group: 'Exit', type: 'number', required: true, default: 1.5, min: 0.5, max: 5, step: 0.1, unit: '%',
    help: 'Sell everything once the price is this far above the average buy price. Must cover fees (about 0.2%).' },
  { key: 'stopLossPercent', label: 'Stop-loss (optional)', group: 'Exit', type: 'number', nullable: true, default: null, min: 0.5, max: 90, step: 0.5, unit: '%',
    help: 'Sell everything at a loss once the price is this far below the average buy price. Leave empty to hold and DCA instead.' },
  { key: 'cooldownMinutes', label: 'Cooldown after a cycle', group: 'Exit', type: 'integer', default: 60, min: 0, max: 1440, unit: 'min',
    help: 'Wait this long after a cycle closes before opening the next one.' },

  { key: 'independentFromLevel', label: 'Independent from level', group: 'Sub-positions', type: 'integer', required: true, default: 3, min: 2,
    help: 'From this buy level on, each buy is its own sub-position with its own take profit.' },
  { key: 'subPositionTriggerPercent', label: 'Sub-position trigger', group: 'Sub-positions', type: 'number', default: 2, min: 0.5, max: 5, step: 0.1, unit: '%',
    help: 'Price drop that triggers the next independent sub-position buy.' },
  { key: 'subPositionTakeProfitPercent', label: 'Sub-position take profit', group: 'Sub-positions', type: 'number', default: 1.5, min: 0.5, max: 5, step: 0.1, unit: '%',
    help: 'Take profit for each independent sub-position.' },

  { key: 'recoveryEnabled', label: 'Recovery mode', group: 'Recovery', type: 'boolean', default: true,
    help: 'After the independent level, keep buying deeper levels and exit the whole basket at the recovery take profit.' },
  { key: 'recoveryMaxOrders', label: 'Recovery buys', group: 'Recovery', type: 'integer', default: 5, min: 1, max: 10,
    showWhen: recovery, help: 'Maximum recovery buys.' },
  { key: 'recoveryStepPercents', label: 'Recovery steps', group: 'Recovery', type: 'numberList', default: [5, 8, 12, 18, 25],
    showWhen: recovery, help: 'Drop (%) from the anchor for each recovery buy.' },
  { key: 'recoveryMultipliers', label: 'Recovery multipliers', group: 'Recovery', type: 'numberList', default: [1, 1.5, 2, 3, 5],
    showWhen: recovery, help: 'Size of each recovery buy as a multiple of the first buy.' },
  { key: 'recoveryTakeProfitPercent', label: 'Recovery take profit', group: 'Recovery', type: 'number', default: 1.5, min: 0.5, max: 5, step: 0.1, unit: '%',
    showWhen: recovery, help: 'Take profit for the whole basket in recovery mode.' },

  { key: 'maxOrderQuote', label: 'Max single order', group: 'Limits', type: 'number', nullable: true, default: null, min: 5, unit: 'USDT',
    help: 'Optional cap on any single buy. Leave empty for no cap.' },
  { key: 'maxDailyRealizedLossQuote', label: 'Daily loss stop', group: 'Limits', type: 'number', nullable: true, default: null, min: 1, unit: 'USDT',
    help: 'Stop new buys for the day after losing this much. Leave empty to disable.' },
  { key: 'maxOpenPairs', label: 'Max open pairs', group: 'Limits', type: 'integer', default: 5, min: 1, max: 20,
    help: 'Maximum different coins with an open position across the user\'s LIVE bots.' },
  { key: 'basePositionPercent', label: 'Base position size', group: 'Limits', type: 'number', default: 1, min: 0.1, max: 5, step: 0.1, unit: '%',
    help: 'Reference size used by the risk planner.' },
  { key: 'maxTotalRiskPercent', label: 'Max total risk', group: 'Limits', type: 'number', default: 3, min: 1, max: 10, step: 0.1, unit: '%',
    help: 'Reference total risk used by the risk planner.' },
];

const FIELDS_BY_KEY = new Map(STRATEGY_FIELDS.map((field) => [field.key as string, field]));

export type PackageStrategyTemplate = Partial<StrategyInput> & Pick<StrategyInput,
  'baseOrderQuote' | 'maxDcaOrders' | 'dcaStepPercent' | 'dcaMultiplier' | 'takeProfitPercent' | 'independentFromLevel'>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Rejects unknown keys and wrongly typed values so a stored template is always well-formed. */
export function sanitizePackageTemplate(raw: unknown): PackageStrategyTemplate {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('Package strategy template must be an object');
  }
  const source = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(source).filter((key) => !FIELDS_BY_KEY.has(key));
  if (unknownKeys.length) {
    throw new BadRequestException(`Unsupported package template setting(s): ${unknownKeys.join(', ')}`);
  }

  const template: Record<string, unknown> = {};
  for (const field of STRATEGY_FIELDS) {
    const value = source[field.key];
    if (value === undefined || value === null) {
      if (field.required) throw new BadRequestException(`${field.label} is required`);
      if (value === null && field.nullable) template[field.key] = null;
      continue;
    }
    switch (field.type) {
      case 'number':
      case 'integer':
        if (!isFiniteNumber(value) || (field.type === 'integer' && !Number.isInteger(value))) {
          throw new BadRequestException(`${field.label} must be ${field.type === 'integer' ? 'a whole number' : 'a number'}`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') throw new BadRequestException(`${field.label} must be true or false`);
        break;
      case 'select':
        if (!field.options?.some((option) => option.value === value)) {
          throw new BadRequestException(`${field.label} must be one of ${field.options?.map((option) => option.value).join(', ')}`);
        }
        break;
      case 'numberList':
        if (!Array.isArray(value) || !value.length || !value.every(isFiniteNumber)) {
          throw new BadRequestException(`${field.label} must be a non-empty list of numbers`);
        }
        template[field.key] = [...value];
        continue;
    }
    template[field.key] = value;
  }
  return template as PackageStrategyTemplate;
}

// Keep the select options in step with the trading engine's accepted values.
for (const [key, values] of [['entryMode', ENTRY_MODES], ['confirmRule', CONFIRM_RULES], ['confirmTimeframe', CONFIRM_TIMEFRAMES]] as const) {
  const options = FIELDS_BY_KEY.get(key)?.options?.map((option) => option.value) ?? [];
  if (options.length !== values.length || values.some((value) => !options.includes(value))) {
    throw new Error(`Strategy field "${key}" options are out of sync with the trading engine`);
  }
}

/** Binance Spot's minimum order value for USDT pairs is 5 USDT. */
export const MIN_PACKAGE_BASE_ORDER_QUOTE = 5;

/** A package bot's share of the package amount, rounded down to 8 decimals so shares never sum above the amount. */
export function allocatedBudget(amountQuote: number, allocationPercent: number) {
  return Math.floor(((amountQuote * allocationPercent) / 100) * 1e8) / 1e8;
}

/** Builds the Binance LIVE bot for one package strategy; its budget and exposure limit both equal its allocation. */
export function packageStrategyInput(
  template: { symbol: string; strategyTemplate: unknown },
  budgetQuote: number,
  name: string,
): StrategyInput {
  return {
    ...sanitizePackageTemplate(template.strategyTemplate),
    name,
    symbol: template.symbol,
    exchange: 'BINANCE',
    environment: 'LIVE',
    paperTrading: false,
    riskBudgetQuote: budgetQuote,
    maxStrategyExposureQuote: budgetQuote,
  };
}
