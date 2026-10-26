import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RecoveryStrategyService } from '../trading/recovery-strategy.service';
import { RiskBudgetService } from '../trading/risk-budget.service';
import { LIVE_CONFIRMATION_VERSION } from '../trading/live-trading-safety.service';
import { StrategyService } from '../trading/strategy.service';
import { allocatedBudget, packageStrategyInput, sanitizePackageTemplate } from './package-template';
import { PackagesService } from './packages.service';

const settings = {
  baseOrderQuote: 10,
  maxDcaOrders: 3,
  dcaStepPercent: 3,
  dcaMultiplier: 1,
  dcaMultipliers: [1, 1.5, 2],
  takeProfitPercent: 1.5,
  independentFromLevel: 3,
  maxDailyRealizedLossQuote: 10,
};

const btc = { id: '00000000-0000-4000-8000-000000000001', name: 'BTC DCA', symbol: 'BTCUSDT', strategyTemplate: settings, active: true };
const eth = { id: '00000000-0000-4000-8000-000000000002', name: 'ETH DCA', symbol: 'ETHUSDT', strategyTemplate: settings, active: true };

const pkg = {
  id: 'pkg-1', name: 'Growth', description: null, amountQuote: 500, active: true, sortOrder: 0,
  createdAt: new Date(), updatedAt: new Date(),
  strategies: [
    { templateId: btc.id, allocationPercent: 60, template: btc },
    { templateId: eth.id, allocationPercent: 40, template: eth },
  ],
};

describe('package template', () => {
  it('rejects unknown or capital-related keys so strategies cannot override LIVE limits', () => {
    expect(() => sanitizePackageTemplate({ ...settings, riskBudgetQuote: 1_000_000 })).toThrow(BadRequestException);
    expect(() => sanitizePackageTemplate({ ...settings, environment: 'TESTNET' })).toThrow(BadRequestException);
    expect(() => sanitizePackageTemplate({ ...settings, baseOrderQuote: '10' })).toThrow(BadRequestException);
    expect(() => sanitizePackageTemplate({ ...settings, dcaMultipliers: [1, 'x'] })).toThrow(BadRequestException);
  });

  it('accepts many equal-size DCA levels with no stop-loss (buy until the budget runs out)', () => {
    const strategies = new StrategyService({} as any, new RiskBudgetService(), new RecoveryStrategyService());
    const unlimited = { ...settings, maxDcaOrders: 200, dcaMultiplier: 1, dcaMultipliers: [], independentFromLevel: 202, recoveryEnabled: false, stopLossPercent: null };
    const input = strategies.validateInput(packageStrategyInput({ symbol: 'BTCUSDT', strategyTemplate: unlimited }, 100, 'Unlimited DCA'));
    expect(input).toEqual(expect.objectContaining({ maxDcaOrders: 200, dcaMultipliers: [], stopLossPercent: null }));
    expect(new RiskBudgetService().buildPlan(input)).toHaveLength(10);
  });

  it('builds a Binance LIVE bot whose budget and exposure equal its allocation', () => {
    expect(packageStrategyInput(btc, 300, 'Growth package x #1')).toEqual(expect.objectContaining({
      exchange: 'BINANCE', environment: 'LIVE', paperTrading: false,
      riskBudgetQuote: 300, maxStrategyExposureQuote: 300, symbol: 'BTCUSDT', baseOrderQuote: 10,
    }));
  });

  it('never allocates more than the package amount in total', () => {
    const shares = [33.33, 33.33, 33.34].map((percent) => allocatedBudget(100, percent));
    expect(shares.reduce((sum, value) => sum + value, 0)).toBeLessThanOrEqual(100);
  });

  it('produces settings the real strategy validation accepts', () => {
    const strategies = new StrategyService({} as any, new RiskBudgetService(), new RecoveryStrategyService());
    expect(() => strategies.validateInput(packageStrategyInput(btc, 100, 'Growth package x'))).not.toThrow();
  });
});

describe('PackagesService', () => {
  function createService(options: {
    credential?: boolean; existing?: boolean; activeTotal?: number;
    profile?: { capitalCeilingQuote: number; confirmedAt: Date | null; confirmationVersion: string | null } | null;
  } = {}) {
    const prisma: any = {
      tradingPackage: {
        findUnique: jest.fn().mockResolvedValue(pkg),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...pkg, ...data, id: 'pkg-2', strategies: pkg.strategies })),
      },
      packageStrategyTemplate: { findMany: jest.fn().mockResolvedValue([btc, eth]) },
      exchangeCredential: { findUnique: jest.fn().mockResolvedValue(options.credential === false ? null : { id: 'cred-1' }) },
      packageSubscription: {
        findFirst: jest.fn().mockResolvedValue(options.existing ? { id: 'sub-0' } : null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub-1', status: 'ACTIVE', ...data })),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amountQuote: options.activeTotal ?? 500 } }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub-1', amountQuote: 500, ...data })),
      },
      liveTradingSafetyProfile: {
        findUnique: jest.fn().mockResolvedValue(options.profile === undefined ? null : options.profile),
        upsert: jest.fn().mockResolvedValue({}),
      },
      tradingPosition: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      tradingStrategy: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      adminAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn().mockImplementation((fn: (tx: any) => unknown) => fn(prisma));
    const strategies = {
      createWithClient: jest.fn().mockImplementation((_tx, _userId, input) => Promise.resolve({ id: `strategy-${input.symbol}`, status: 'STOPPED' })),
      validateInput: jest.fn(),
    } as any;
    return { service: new PackagesService(prisma, strategies), prisma, strategies };
  }

  it('lists packages to users without exposing their strategies', async () => {
    const { service, prisma } = createService();
    prisma.tradingPackage.findMany = jest.fn().mockResolvedValue([{ id: 'pkg-1', name: 'Growth', description: null, amountQuote: '500' }]);
    const result = await service.listAvailable();
    expect(prisma.tradingPackage.findMany.mock.calls[0][0].select).toEqual({ id: true, name: true, description: true, amountQuote: true });
    expect(result).toEqual([{ id: 'pkg-1', name: 'Growth', description: null, amountQuote: 500 }]);
  });

  it('requires the user to connect their own Binance LIVE key first', async () => {
    const { service, strategies } = createService({ credential: false });
    await expect(service.subscribe('user-1', 'pkg-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(strategies.createWithClient).not.toHaveBeenCalled();
  });

  it('rejects inactive packages and packages with an inactive strategy', async () => {
    const { service, prisma } = createService();
    prisma.tradingPackage.findUnique.mockResolvedValueOnce({ ...pkg, active: false });
    await expect(service.subscribe('user-1', 'pkg-1')).rejects.toBeInstanceOf(NotFoundException);
    prisma.tradingPackage.findUnique.mockResolvedValueOnce({ ...pkg, strategies: [{ ...pkg.strategies[0], template: { ...btc, active: false } }] });
    await expect(service.subscribe('user-1', 'pkg-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a second active subscription to the same package', async () => {
    const { service, strategies } = createService({ existing: true });
    await expect(service.subscribe('user-1', 'pkg-1')).rejects.toBeInstanceOf(ConflictException);
    expect(strategies.createWithClient).not.toHaveBeenCalled();
  });

  it('creates one generically named bot per strategy with its share of the amount', async () => {
    const { service, prisma, strategies } = createService({
      activeTotal: 600,
      profile: { capitalCeilingQuote: 100, confirmedAt: new Date(), confirmationVersion: LIVE_CONFIRMATION_VERSION },
    });
    const result = await service.subscribe('user-1', 'pkg-1');
    expect(prisma.packageSubscription.create).toHaveBeenCalledWith({ data: { userId: 'user-1', packageId: 'pkg-1', amountQuote: 500 } });
    expect(strategies.createWithClient).toHaveBeenCalledTimes(2);
    const [first, second] = strategies.createWithClient.mock.calls;
    expect(first[2]).toEqual(expect.objectContaining({ symbol: 'BTCUSDT', riskBudgetQuote: 300, maxStrategyExposureQuote: 300, environment: 'LIVE' }));
    expect(second[2]).toEqual(expect.objectContaining({ symbol: 'ETHUSDT', riskBudgetQuote: 200 }));
    expect(first[3]).toEqual({ packageSubscriptionId: 'sub-1' });
    expect(first[2].name).toMatch(/^Growth package [0-9a-f]{8} #1$/);
    expect(first[2].name).not.toContain('BTC');
    expect(prisma.liveTradingSafetyProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { capitalCeilingQuote: 600, confirmedAt: null, confirmationVersion: null },
    }));
    expect(result).toEqual(expect.objectContaining({ capitalCeilingQuote: 600, confirmationRequired: true }));
  });

  it('keeps an existing confirmation when the ceiling already covers all packages', async () => {
    const { service, prisma } = createService({
      activeTotal: 500,
      profile: { capitalCeilingQuote: 1000, confirmedAt: new Date(), confirmationVersion: LIVE_CONFIRMATION_VERSION },
    });
    const result = await service.subscribe('user-1', 'pkg-1');
    expect(prisma.liveTradingSafetyProfile.upsert).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ capitalCeilingQuote: 1000, confirmationRequired: false }));
  });

  it('starts and stops all bots of a subscription together', async () => {
    const { service, prisma } = createService();
    prisma.packageSubscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });
    await service.setBotStatus('user-1', 'sub-1', 'RUNNING');
    expect(prisma.tradingStrategy.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-1', packageSubscriptionId: 'sub-1' }, data: { status: 'RUNNING' } });

    prisma.packageSubscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'CANCELLED' });
    await expect(service.setBotStatus('user-1', 'sub-1', 'RUNNING')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to cancel while any bot is running or has an open position', async () => {
    const { service, prisma } = createService();
    prisma.packageSubscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE', amountQuote: 500, strategies: [{ id: 's-1', status: 'STOPPED' }, { id: 's-2', status: 'RUNNING' }] });
    await expect(service.cancel('user-1', 'sub-1')).rejects.toThrow('Stop the package');

    prisma.packageSubscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE', amountQuote: 500, strategies: [{ id: 's-1', status: 'STOPPED' }] });
    prisma.tradingPosition.count.mockResolvedValue(1);
    await expect(service.cancel('user-1', 'sub-1')).rejects.toThrow('open positions');
    expect(prisma.packageSubscription.update).not.toHaveBeenCalled();
  });

  it('cancels a stopped subscription without open positions', async () => {
    const { service, prisma } = createService();
    prisma.packageSubscription.findFirst.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE', amountQuote: 500, strategies: [{ id: 's-1', status: 'PAUSED' }] });
    const result = await service.cancel('user-1', 'sub-1');
    expect(prisma.tradingStrategy.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-1', packageSubscriptionId: 'sub-1' }, data: { status: 'STOPPED' } });
    expect(result.status).toBe('CANCELLED');
  });

  describe('admin package validation', () => {
    const create = (service: PackagesService, strategies: Array<{ templateId: string; allocationPercent: number }>, amountQuote = 500) =>
      service.adminCreate('admin-1', { name: 'Growth', amountQuote, strategies });

    it('requires allocations to add up to 100%', async () => {
      const { service, prisma } = createService();
      await expect(create(service, [{ templateId: btc.id, allocationPercent: 60 }, { templateId: eth.id, allocationPercent: 30 }]))
        .rejects.toThrow('add up to 100%');
      expect(prisma.tradingPackage.create).not.toHaveBeenCalled();
    });

    it('rejects a strategy whose share cannot fund its base order', async () => {
      const { service } = createService();
      await expect(create(service, [{ templateId: btc.id, allocationPercent: 98 }, { templateId: eth.id, allocationPercent: 2 }], 100))
        .rejects.toThrow('needs at least 10 USDT');
    });

    it('rejects duplicate, unknown or inactive strategies', async () => {
      const { service, prisma } = createService();
      await expect(create(service, [{ templateId: btc.id, allocationPercent: 50 }, { templateId: btc.id, allocationPercent: 50 }]))
        .rejects.toThrow('only once');
      prisma.packageStrategyTemplate.findMany.mockResolvedValueOnce([btc]);
      await expect(create(service, [{ templateId: btc.id, allocationPercent: 50 }, { templateId: eth.id, allocationPercent: 50 }]))
        .rejects.toThrow('Unknown strategy');
      prisma.packageStrategyTemplate.findMany.mockResolvedValueOnce([btc, { ...eth, active: false }]);
      await expect(create(service, [{ templateId: btc.id, allocationPercent: 50 }, { templateId: eth.id, allocationPercent: 50 }]))
        .rejects.toThrow('inactive');
    });

    it('creates a valid package, validating every bot and auditing the change', async () => {
      const { service, prisma, strategies } = createService();
      const result = await create(service, [{ templateId: btc.id, allocationPercent: 60 }, { templateId: eth.id, allocationPercent: 40 }]);
      expect(strategies.validateInput).toHaveBeenCalledTimes(2);
      expect(prisma.tradingPackage.create).toHaveBeenCalled();
      expect(prisma.adminAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'TRADING_PACKAGE_CREATED' }) });
      expect(result.strategies.map((item) => item.budgetQuote)).toEqual([300, 200]);
    });
  });

  it('rejects strategies with a base order below the Binance minimum', async () => {
    const { service, prisma } = createService();
    prisma.packageStrategyTemplate.create = jest.fn();
    await expect(service.adminCreateTemplate('admin-1', { name: 'Dust', symbol: 'BTCUSDT', strategyTemplate: { ...settings, baseOrderQuote: 1 } }))
      .rejects.toThrow('at least 5 USDT');
    expect(prisma.packageStrategyTemplate.create).not.toHaveBeenCalled();
  });
});
