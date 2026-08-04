import { ExchangeName, Prisma } from '@prisma/client';
import { HistoricalCandleIngestionService } from './historical-candle-ingestion.service';

describe('HistoricalCandleIngestionService', () => {
  function createService() {
    const historicalCandle = {
      upsert: jest.fn((args) => args),
    };
    const prisma = {
      historicalCandle,
      $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
    } as any;

    return {
      service: new HistoricalCandleIngestionService(prisma),
      prisma,
      historicalCandle,
    };
  }

  it('returns zero without opening a transaction when no candles are supplied', async () => {
    const { service, prisma, historicalCandle } = createService();

    await expect(service.upsertMany([])).resolves.toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(historicalCandle.upsert).not.toHaveBeenCalled();
  });

  it('normalizes and upserts candles using the unique candle identity', async () => {
    const { service, prisma, historicalCandle } = createService();
    const openTime = new Date('2026-08-01T00:00:00.000Z');
    const closeTime = new Date('2026-08-01T00:04:59.999Z');

    await expect(
      service.upsertMany([
        {
          symbol: ' btcusdt ',
          interval: ' 5m ',
          openTime,
          closeTime,
          open: '100.1',
          high: '105.2',
          low: '99.5',
          close: '104.8',
          volume: '12.34',
        },
      ]),
    ).resolves.toBe(1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(historicalCandle.upsert).toHaveBeenCalledWith({
      where: {
        exchange_symbol_interval_openTime: {
          exchange: ExchangeName.BINANCE,
          symbol: 'BTCUSDT',
          interval: '5m',
          openTime,
        },
      },
      create: {
        exchange: ExchangeName.BINANCE,
        symbol: 'BTCUSDT',
        interval: '5m',
        openTime,
        closeTime,
        open: new Prisma.Decimal('100.1'),
        high: new Prisma.Decimal('105.2'),
        low: new Prisma.Decimal('99.5'),
        close: new Prisma.Decimal('104.8'),
        volume: new Prisma.Decimal('12.34'),
      },
      update: {
        closeTime,
        open: new Prisma.Decimal('100.1'),
        high: new Prisma.Decimal('105.2'),
        low: new Prisma.Decimal('99.5'),
        close: new Prisma.Decimal('104.8'),
        volume: new Prisma.Decimal('12.34'),
      },
    });
  });

  it('preserves the explicitly supplied Binance exchange', async () => {
    const { service, historicalCandle } = createService();
    const openTime = new Date('2026-08-01T00:00:00.000Z');

    await service.upsertMany([
      {
        exchange: ExchangeName.BINANCE,
        symbol: 'ETHUSDT',
        interval: '1h',
        openTime,
        closeTime: new Date('2026-08-01T00:59:59.999Z'),
        open: 1,
        high: 2,
        low: 0.5,
        close: 1.5,
        volume: 10,
      },
    ]);

    expect(historicalCandle.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          exchange_symbol_interval_openTime: {
            exchange: ExchangeName.BINANCE,
            symbol: 'ETHUSDT',
            interval: '1h',
            openTime,
          },
        },
      }),
    );
  });
});
