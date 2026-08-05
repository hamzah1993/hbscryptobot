import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BacktestRunStatus, ExchangeName, Prisma } from '@prisma/client';
import { BacktestRunService } from './backtest-run.service';

describe('BacktestRunService', () => {
  function createService() {
    const tradingStrategy = {
      findFirst: jest.fn(),
    };
    const backtestRun = {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    };
    const prisma = { tradingStrategy, backtestRun } as any;

    return {
      service: new BacktestRunService(prisma),
      tradingStrategy,
      backtestRun,
    };
  }

  it('creates a normalized pending run for a user-owned strategy', async () => {
    const { service, tradingStrategy, backtestRun } = createService();
    const startTime = new Date('2026-08-01T00:00:00.000Z');
    const endTime = new Date('2026-08-02T00:00:00.000Z');
    tradingStrategy.findFirst.mockResolvedValue({
      id: 'strategy-1',
      symbol: 'BTCUSDT',
      exchange: ExchangeName.BINANCE,
    });
    backtestRun.create.mockResolvedValue({ id: 'run-1' });

    await expect(
      service.create('user-1', {
        strategyId: ' strategy-1 ',
        symbol: ' btcusdt ',
        interval: ' 5m ',
        startTime,
        endTime,
        initialCapital: '1000.50',
      }),
    ).resolves.toEqual({ id: 'run-1' });

    expect(tradingStrategy.findFirst).toHaveBeenCalledWith({
      where: { id: 'strategy-1', userId: 'user-1' },
      select: { id: true, symbol: true, exchange: true },
    });
    expect(backtestRun.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        strategyId: 'strategy-1',
        exchange: ExchangeName.BINANCE,
        symbol: 'BTCUSDT',
        interval: '5m',
        startTime,
        endTime,
        initialCapital: new Prisma.Decimal('1000.50'),
        status: BacktestRunStatus.PENDING,
      },
    });
  });

  it('rejects creation when the strategy does not belong to the user', async () => {
    const { service, tradingStrategy, backtestRun } = createService();
    tradingStrategy.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-1', {
        strategyId: 'strategy-2',
        symbol: 'BTCUSDT',
        interval: '5m',
        startTime: new Date('2026-08-01T00:00:00.000Z'),
        endTime: new Date('2026-08-02T00:00:00.000Z'),
        initialCapital: 1000,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(backtestRun.create).not.toHaveBeenCalled();
  });

  it.each([
    [{ strategyId: ' ', symbol: 'BTCUSDT', interval: '5m' }, 'Strategy ID is required'],
    [{ strategyId: 'strategy-1', symbol: ' ', interval: '5m' }, 'Symbol is required'],
    [{ strategyId: 'strategy-1', symbol: 'BTCUSDT', interval: ' ' }, 'Interval is required'],
  ])('rejects missing required creation fields %#', async (partial, message) => {
    const { service, tradingStrategy, backtestRun } = createService();

    await expect(
      service.create('user-1', {
        strategyId: partial.strategyId,
        symbol: partial.symbol,
        interval: partial.interval,
        startTime: new Date('2026-08-01T00:00:00.000Z'),
        endTime: new Date('2026-08-02T00:00:00.000Z'),
        initialCapital: 1000,
      }),
    ).rejects.toThrow(message);

    expect(tradingStrategy.findFirst).not.toHaveBeenCalled();
    expect(backtestRun.create).not.toHaveBeenCalled();
  });

  it('rejects invalid dates, reversed ranges, and non-positive capital', async () => {
    const { service, tradingStrategy, backtestRun } = createService();
    const base = {
      strategyId: 'strategy-1',
      symbol: 'BTCUSDT',
      interval: '5m',
      initialCapital: 1000,
    };

    await expect(
      service.create('user-1', {
        ...base,
        startTime: new Date('invalid'),
        endTime: new Date('2026-08-02T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create('user-1', {
        ...base,
        startTime: new Date('2026-08-01T00:00:00.000Z'),
        endTime: new Date('invalid'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create('user-1', {
        ...base,
        startTime: new Date('2026-08-02T00:00:00.000Z'),
        endTime: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create('user-1', {
        ...base,
        startTime: new Date('2026-08-01T00:00:00.000Z'),
        endTime: new Date('2026-08-02T00:00:00.000Z'),
        initialCapital: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tradingStrategy.findFirst).not.toHaveBeenCalled();
    expect(backtestRun.create).not.toHaveBeenCalled();
  });

  it('lists user runs with descending creation order and a bounded limit', async () => {
    const { service, backtestRun } = createService();
    backtestRun.findMany.mockResolvedValue([{ id: 'run-1' }]);

    await expect(service.list('user-1', 50)).resolves.toEqual([{ id: 'run-1' }]);
    expect(backtestRun.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it.each([0, -1, 501, 1.5])('rejects an invalid run list limit: %s', (limit) => {
    const { service, backtestRun } = createService();

    expect(() => service.list('user-1', limit)).toThrow(BadRequestException);
    expect(backtestRun.findMany).not.toHaveBeenCalled();
  });

  it('returns a user-owned run and rejects missing runs', async () => {
    const { service, backtestRun } = createService();
    backtestRun.findFirst
      .mockResolvedValueOnce({ id: 'run-1' })
      .mockResolvedValueOnce(null);

    await expect(service.get('user-1', ' run-1 ')).resolves.toEqual({ id: 'run-1' });
    expect(backtestRun.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'run-1', userId: 'user-1' },
    });

    await expect(service.get('user-1', 'run-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an empty run ID before querying Prisma', async () => {
    const { service, backtestRun } = createService();

    await expect(service.get('user-1', '   ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(backtestRun.findFirst).not.toHaveBeenCalled();
  });
});
