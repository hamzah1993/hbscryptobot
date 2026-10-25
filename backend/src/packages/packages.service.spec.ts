import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RecoveryStrategyService } from '../trading/recovery-strategy.service';
import { RiskBudgetService } from '../trading/risk-budget.service';
import { LIVE_CONFIRMATION_VERSION } from '../trading/live-trading-safety.service';
import { StrategyService } from '../trading/strategy.service';
import { packageStrategyInput, sanitizePackageTemplate } from './package-template';
import { PackagesService } from './packages.service';

const template = {
  baseOrderQuote: 10,
  maxDcaOrders: 3,
  dcaStepPercent: 3,
  dcaMultiplier: 1,
  dcaMultipliers: [1, 1.5, 2],
  takeProfitPercent: 1.5,
  independentFromLevel: 3,
  maxDailyRealizedLossQuote: 10,
};

const pkg = {
  id: 'pkg-1', name: 'Starter', description: null, amountQuote: 100, symbol: 'BTCUSDT',
  strategyTemplate: template, active: true, sortOrder: 0,
};

describe('package template', () => {
  it('rejects unknown or capital-related keys so packages cannot override LIVE limits', () => {
    expect(() => sanitizePackageTemplate({ ...template, riskBudgetQuote: 1_000_000 })).toThrow(BadRequestException);
    expect(() => sanitizePackageTemplate({ ...template, environment: 'TESTNET' })).toThrow(BadRequestException);
    expect(() => sanitizePackageTemplate({ ...template, baseOrderQuote: '10' })).toThrow(BadRequestException);
    expect(() => sanitizePackageTemplate({ ...template, dcaMultipliers: [] })).toThrow(BadRequestException);
  });

  it('builds a Binance LIVE strategy whose budget and exposure equal the package amount', () => {
    expect(packageStrategyInput(pkg, 'Starter package x')).toEqual(expect.objectContaining({
      exchange: 'BINANCE', environment: 'LIVE', paperTrading: false,
      riskBudgetQuote: 100, maxStrategyExposureQuote: 100, symbol: 'BTCUSDT', baseOrderQuote: 10,
    }));
  });

  it('produces a template the real strategy validation accepts', () => {
    const strategies = new StrategyService({} as any, new RiskBudgetService(), new RecoveryStrategyService());
    expect(() => strategies.validateInput(packageStrategyInput(pkg, 'Starter package x'))).not.toThrow();
  });
});

describe('PackagesService', () => {
  function createService(options: {
    credential?: boolean; existing?: boolean; activeTotal?: number;
    profile?: { capitalCeilingQuote: number; confirmedAt: Date | null; confirmationVersion: string | null } | null;
  } = {}) {
    const prisma: any = {
      tradingPackage: { findUnique: jest.fn().mockResolvedValue(pkg) },
      exchangeCredential: { findUnique: jest.fn().mockResolvedValue(options.credential === false ? null : { id: 'cred-1' }) },
      packageSubscription: {
        findFirst: jest.fn().mockResolvedValue(options.existing ? { id: 'sub-0' } : null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub-1', status: 'ACTIVE', ...data })),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountQuote: options.activeTotal ?? 100 } }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub-1', ...data })),
      },
      liveTradingSafetyProfile: {
        findUnique: jest.fn().mockResolvedValue(options.profile === undefined ? null : options.profile),
        upsert: jest.fn().mockResolvedValue({}),
      },
      tradingPosition: { count: jest.fn().mockResolvedValue(0) },
      tradingStrategy: { update: jest.fn().mockResolvedValue({}) },
      adminAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn().mockImplementation((fn: (tx: any) => unknown) => fn(prisma));
    const strategies = {
      createWithClient: jest.fn().mockResolvedValue({ id: 'strategy-1', name: 'Starter package x', status: 'STOPPED' }),
      validateInput: jest.fn(),
    } as any;
    return { service: new PackagesService(prisma, strategies), prisma, strategies };
  }

  it('requires the user to connect their own Binance LIVE key first', async () => {
    const { service, strategies } = createService({ credential: false });
    await expect(service.subscribe('user-1', 'pkg-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(strategies.createWithClient).not.toHaveBeenCalled();
  });

  it('rejects inactive packages', async () => {
    const { service, prisma } = createService();
    prisma.tradingPackage.findUnique.mockResolvedValue({ ...pkg, active: false });
    await expect(service.subscribe('user-1', 'pkg-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a second active subscription to the same package', async () => {
    const { service, strategies } = createService({ existing: true });
    await expect(service.subscribe('user-1', 'pkg-1')).rejects.toBeInstanceOf(ConflictException);
    expect(strategies.createWithClient).not.toHaveBeenCalled();
  });

  it('creates a stopped LIVE strategy and raises the capital ceiling, forcing re-confirmation', async () => {
    const { service, prisma, strategies } = createService({
      activeTotal: 600,
      profile: { capitalCeilingQuote: 100, confirmedAt: new Date(), confirmationVersion: LIVE_CONFIRMATION_VERSION },
    });
    const result = await service.subscribe('user-1', 'pkg-1');
    expect(strategies.createWithClient).toHaveBeenCalledWith(prisma, 'user-1', expect.objectContaining({
      environment: 'LIVE', riskBudgetQuote: 100, maxStrategyExposureQuote: 100,
    }));
    expect(prisma.packageSubscription.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', packageId: 'pkg-1', strategyId: 'strategy-1', amountQuote: 100 },
    });
    expect(prisma.liveTradingSafetyProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { capitalCeilingQuote: 600, confirmedAt: null, confirmationVersion: null },
    }));
    expect(result).toEqual(expect.objectContaining({ capitalCeilingQuote: 600, confirmationRequired: true }));
  });

  it('keeps an existing confirmation when the ceiling already covers all packages', async () => {
    const { service, prisma } = createService({
      activeTotal: 100,
      profile: { capitalCeilingQuote: 500, confirmedAt: new Date(), confirmationVersion: LIVE_CONFIRMATION_VERSION },
    });
    const result = await service.subscribe('user-1', 'pkg-1');
    expect(prisma.liveTradingSafetyProfile.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ capitalCeilingQuote: 500, confirmationRequired: false }));
  });

  it('refuses to cancel while the bot is running or has an open position', async () => {
    const { service, prisma } = createService();
    prisma.packageSubscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE', strategy: { id: 's-1', status: 'RUNNING' } });
    await expect(service.cancel('user-1', 'sub-1')).rejects.toThrow('Stop the package bot');

    prisma.packageSubscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE', strategy: { id: 's-1', status: 'STOPPED' } });
    prisma.tradingPosition.count.mockResolvedValue(1);
    await expect(service.cancel('user-1', 'sub-1')).rejects.toThrow('open position');
    expect(prisma.packageSubscription.update).not.toHaveBeenCalled();
  });

  it('cancels a stopped subscription without open positions', async () => {
    const { service, prisma } = createService();
    prisma.packageSubscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE', strategy: { id: 's-1', status: 'PAUSED' } });
    const result = await service.cancel('user-1', 'sub-1');
    expect(prisma.tradingStrategy.update).toHaveBeenCalledWith({ where: { id: 's-1' }, data: { status: 'STOPPED' } });
    expect(result.status).toBe('CANCELLED');
  });

  it('rejects packages that cannot fund their base order or fall below the exchange minimum', async () => {
    const { service, prisma } = createService();
    prisma.tradingPackage.create = jest.fn();
    await expect(service.adminCreate('admin-1', { name: 'Tiny', amountQuote: 5, symbol: 'BTCUSDT', strategyTemplate: template }))
      .rejects.toThrow('cover at least the base order');
    await expect(service.adminCreate('admin-1', { name: 'Dust', amountQuote: 100, symbol: 'BTCUSDT', strategyTemplate: { ...template, baseOrderQuote: 1 } }))
      .rejects.toThrow('at least 5 USDT');
    expect(prisma.tradingPackage.create).not.toHaveBeenCalled();
  });

  it('validates package settings through strategy validation and audits admin changes', async () => {
    const { service, prisma, strategies } = createService();
    prisma.tradingPackage.create = jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pkg-2', ...data }));
    await service.adminCreate('admin-1', { name: ' Growth ', amountQuote: 500, symbol: 'btc/usdt', strategyTemplate: template });
    expect(strategies.validateInput).toHaveBeenCalledWith(expect.objectContaining({ riskBudgetQuote: 500, symbol: 'BTCUSDT' }));
    expect(prisma.tradingPackage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Growth', symbol: 'BTCUSDT' }) });
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'TRADING_PACKAGE_CREATED' }) });
  });
});
