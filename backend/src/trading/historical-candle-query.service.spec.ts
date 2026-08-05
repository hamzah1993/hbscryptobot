import { BadRequestException } from '@nestjs/common';
import { ExchangeName } from '@prisma/client';
import { HistoricalCandleQueryService } from './historical-candle-query.service';

describe('HistoricalCandleQueryService', () => {
  function createService() {
    const historicalCandle = {
      findMany: jest.fn(),
    };
    const prisma = { historicalCandle } as any;

    return {
      service: new HistoricalCandleQueryService(prisma),
      historicalCandle,
    };
  }

  it('normalizes query fields and uses bounded defaults', async () => {
    const { service, historicalCandle } = createService();
    historicalCandle.findMany.mockResolvedValue([]);

    await expect(
      service.list({ symbol: ' btcusdt ', interval: ' 5m ' }),
    ).resolves.toEqual([]);

    expect(historicalCandle.findMany).toHaveBeenCalledWith({
      where: {
        exchange: ExchangeName.BINANCE,
        symbol: 'BTCUSDT',
        interval: '5m',
        openTime: {
          gte: undefined,
          lte: undefined,
        },
      },
      orderBy: { openTime: 'asc' },
      take: 1000,
    });
  });

  it('passes explicit date bounds and result limit to Prisma', async () => {
    const { service, historicalCandle } = createService();
    const startTime = new Date('2026-08-01T00:00:00.000Z');
    const endTime = new Date('2026-08-02T00:00:00.000Z');
    historicalCandle.findMany.mockResolvedValue([{ id: 'candle-1' }]);

    await expect(
      service.list({
        exchange: ExchangeName.BINANCE,
        symbol: 'ETHUSDT',
        interval: '1h',
        startTime,
        endTime,
        limit: 2500,
      }),
    ).resolves.toEqual([{ id: 'candle-1' }]);

    expect(historicalCandle.findMany).toHaveBeenCalledWith({
      where: {
        exchange: ExchangeName.BINANCE,
        symbol: 'ETHUSDT',
        interval: '1h',
        openTime: {
          gte: startTime,
          lte: endTime,
        },
      },
      orderBy: { openTime: 'asc' },
      take: 2500,
    });
  });

  it.each([
    [{ symbol: '   ', interval: '5m' }, 'Symbol is required'],
    [{ symbol: 'BTCUSDT', interval: '   ' }, 'Interval is required'],
    [{ symbol: 'BTCUSDT', interval: '5m', limit: 0 }, 'Historical candle limit'],
    [{ symbol: 'BTCUSDT', interval: '5m', limit: 5001 }, 'Historical candle limit'],
    [{ symbol: 'BTCUSDT', interval: '5m', limit: 1.5 }, 'Historical candle limit'],
  ])('rejects invalid query input %#', async (query, message) => {
    const { service, historicalCandle } = createService();

    await expect(service.list(query as any)).rejects.toThrow(message);
    expect(historicalCandle.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid dates and reversed date ranges', async () => {
    const { service, historicalCandle } = createService();

    await expect(
      service.list({
        symbol: 'BTCUSDT',
        interval: '5m',
        startTime: new Date('invalid'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.list({
        symbol: 'BTCUSDT',
        interval: '5m',
        endTime: new Date('invalid'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.list({
        symbol: 'BTCUSDT',
        interval: '5m',
        startTime: new Date('2026-08-02T00:00:00.000Z'),
        endTime: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(historicalCandle.findMany).not.toHaveBeenCalled();
  });
});
