import { BadRequestException } from '@nestjs/common';

export function decimalPlaces(step: string) {
  const normalized = step.toLowerCase();
  if (normalized.includes('e-')) return Number(normalized.split('e-')[1] ?? 0);
  return (normalized.split('.')[1] ?? '').replace(/0+$/, '').length;
}

export function floorToStep(value: number, stepInput: string, label: string) {
  const step = Number(stepInput);
  if (!Number.isFinite(value) || value <= 0) throw new BadRequestException(`${label} must be positive`);
  if (!Number.isFinite(step) || step <= 0) throw new BadRequestException(`${label} step is invalid`);
  const precision = decimalPlaces(stepInput);
  const scale = 10 ** precision;
  const stepUnits = Math.round(step * scale);
  const valueUnits = Math.floor(value * scale + Number.EPSILON);
  if (!Number.isSafeInteger(stepUnits) || stepUnits <= 0) throw new BadRequestException(`${label} step is unsupported`);
  const normalized = Math.floor(valueUnits / stepUnits) * stepUnits / scale;
  if (normalized <= 0) throw new BadRequestException(`${label} is below the exchange precision`);
  return normalized.toFixed(precision);
}

export function assertMinimum(value: string, minimumInput: string | undefined, label: string) {
  const minimum = Number(minimumInput ?? 0);
  if (Number.isFinite(minimum) && minimum > 0 && Number(value) < minimum) {
    throw new BadRequestException(`${label} must be at least ${minimumInput}`);
  }
}

export function assertMaximum(value: string, maximumInput: string | undefined, label: string) {
  const maximum = Number(maximumInput ?? 0);
  if (Number.isFinite(maximum) && maximum > 0 && Number(value) > maximum) {
    throw new BadRequestException(`${label} must not exceed ${maximumInput}`);
  }
}

export function normalizeClientOrderId(value: string, maxLength: number) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, maxLength);
  if (!normalized) throw new BadRequestException('Client order ID is required');
  return normalized;
}
