import { BadRequestException } from '@nestjs/common';
import type { StrategyInput } from '../trading/strategy.service';

/**
 * Strategy settings an admin may preset on a package. Identity, exchange,
 * environment and the capital fields are deliberately excluded: every package
 * strategy is Binance LIVE, and its risk budget and exposure limit always equal
 * the package amount.
 */
const REQUIRED_NUMBER_KEYS = [
  'baseOrderQuote',
  'maxDcaOrders',
  'dcaStepPercent',
  'dcaMultiplier',
  'takeProfitPercent',
  'independentFromLevel',
] as const;

const OPTIONAL_NUMBER_KEYS = [
  'subPositionTriggerPercent',
  'subPositionTakeProfitPercent',
  'basePositionPercent',
  'maxTotalRiskPercent',
  'maxOpenPairs',
  'cooldownMinutes',
  'recoveryMaxOrders',
  'recoveryTakeProfitPercent',
  'maxOrderQuote',
  'maxDailyRealizedLossQuote',
] as const;

const OPTIONAL_NUMBER_LIST_KEYS = ['dcaMultipliers', 'recoveryStepPercents', 'recoveryMultipliers'] as const;

type TemplateKey =
  | (typeof REQUIRED_NUMBER_KEYS)[number]
  | (typeof OPTIONAL_NUMBER_KEYS)[number]
  | (typeof OPTIONAL_NUMBER_LIST_KEYS)[number]
  | 'recoveryEnabled';

export type PackageStrategyTemplate = Pick<StrategyInput, (typeof REQUIRED_NUMBER_KEYS)[number]>
  & Partial<Pick<StrategyInput, Exclude<TemplateKey, (typeof REQUIRED_NUMBER_KEYS)[number]>>>;

const ALLOWED_KEYS = new Set<string>([
  ...REQUIRED_NUMBER_KEYS, ...OPTIONAL_NUMBER_KEYS, ...OPTIONAL_NUMBER_LIST_KEYS, 'recoveryEnabled',
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Rejects unknown keys and wrongly typed values so a stored template is always well-formed. */
export function sanitizePackageTemplate(raw: unknown): PackageStrategyTemplate {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('Package strategy template must be an object');
  }
  const source = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(source).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length) {
    throw new BadRequestException(`Unsupported package template setting(s): ${unknownKeys.join(', ')}`);
  }

  const template: Record<string, unknown> = {};
  for (const key of REQUIRED_NUMBER_KEYS) {
    if (!isFiniteNumber(source[key])) throw new BadRequestException(`Package template ${key} must be a number`);
    template[key] = source[key];
  }
  for (const key of OPTIONAL_NUMBER_KEYS) {
    if (source[key] === undefined || source[key] === null) continue;
    if (!isFiniteNumber(source[key])) throw new BadRequestException(`Package template ${key} must be a number`);
    template[key] = source[key];
  }
  for (const key of OPTIONAL_NUMBER_LIST_KEYS) {
    if (source[key] === undefined) continue;
    const list = source[key];
    if (!Array.isArray(list) || !list.length || !list.every(isFiniteNumber)) {
      throw new BadRequestException(`Package template ${key} must be a non-empty list of numbers`);
    }
    template[key] = [...list];
  }
  if (source.recoveryEnabled !== undefined) {
    if (typeof source.recoveryEnabled !== 'boolean') throw new BadRequestException('Package template recoveryEnabled must be true or false');
    template.recoveryEnabled = source.recoveryEnabled;
  }
  return template as PackageStrategyTemplate;
}

export function packageStrategyInput(
  pkg: { symbol: string; amountQuote: unknown; strategyTemplate: unknown },
  name: string,
): StrategyInput {
  const amount = Number(pkg.amountQuote);
  return {
    ...sanitizePackageTemplate(pkg.strategyTemplate),
    name,
    symbol: pkg.symbol,
    exchange: 'BINANCE',
    environment: 'LIVE',
    paperTrading: false,
    riskBudgetQuote: amount,
    maxStrategyExposureQuote: amount,
  };
}
