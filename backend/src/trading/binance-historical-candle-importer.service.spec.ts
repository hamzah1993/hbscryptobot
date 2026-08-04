import { BadRequestException } from '@nestjs/common';
import { BinanceHistoricalCandleImporterService } from './binance-historical-candle-importer.service';

describe('BinanceHistoricalCandleImporterService', () => {
  function createService() {
    const binance = {
      getKlines: jest.fn(),
    } as any;
    const ingestion = {
      upsertMany: jest.fn(),
    } as any;

    return {
      service: new BinanceHistoricalCandleImporterService(binance, ingestion),
      binance,
      ingestion,
    };
  }

  it('normalizes defaults and imports one Binance candle page', async () => {
    const { service, binance, ingestion } = createService();
    binance.getKlines.mockResolvedValue([
      {
        openTime: 1_754_006_400_000,
        closeTime: 1_754_006_699_999,
        open: '100.1',
        high: '105.2',
        low: '99.5',
        close: '104.8',
        volume: '12.34',
      },
    ]);
    ingestion.upsertMany.mockResolvedValue(1);

    await expect(service.import({ symbol: ' btcusdt ' })).resolves.toEqual({
      symbol: 'BTCUSDT',
      interval: '5m',
      requestedPerPage: 200,
      imported: 1,
      pages: 1,
      startTime: undefined,
      endTime: undefined,
    });

    expect(binance.getKlines).toHaveBeenCalledWith(
      'BTCUSDT',
      '5m',
      200,
      'live',
      { startTime: undefined, endTime: undefined },
    );
    expect(ingestion.upsertMany).toHaveBeenCalledWith([
      {
        symbol: 'BTCUSDT',
        interval: '5m',
        openTime: new Date(1_754_006_400_000),
        closeTime: new Date(1_754_006_699_999),
        open: '100.1',
        high: '105.2',
        low: '99.5',
        close: '104.8',
        volume: '12.34',
      },
    ]);
  });

  it('paginates from the prior page close time and aggregates imports', async () => {
    const { service, binance, ingestion } = createService();
    const firstPage = [
      {
        openTime: 1_000,
        closeTime: 1_999,
        open: '1',
        high: '2',
        low: '0.5',
        close: '1.5',
        volume: '10',
      },
      {
        openTime: 2_000,
        closeTime: 2_999,
        open: '1.5',
        high: '2.5',
        low: '1',
        close: '2',
        volume: '11',
      },
    ];
    const secondPage = [
      {
        openTime: 3_000,
        closeTime: 3_999,
        open: '2',
        high: '3',
        low: '1.5',
        close: '2.5',
        volume: '12',
      },
    ];
    binance.getKlines
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    ingestion.upsertMany
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    await expect(
      service.import({
        symbol: 'ETHUSDT',
        interval: '1m',
        limit: 2,
        startTime: 1_000,
        endTime: 5_000,
        maxPages: 5,
      }),
    ).resolves.toEqual({
      symbol: 'ETHUSDT',
      interval: '1m',
      requestedPerPage: 2,
      imported: 3,
      pages: 2,
      startTime: 1_000,
      endTime: 5_000,
    });

    expect(binance.getKlines).toHaveBeenNthCalledWith(
      1,
      'ETHUSDT',
      '1m',
      2,
      'live',
      { startTime: 1_000, endTime: 5_000 },
    );
    expect(binance.getKlines).toHaveBeenNthCalledWith(
      2,
      'ETHUSDT',
      '1m',
      2,
      'live',
      { startTime: 3_000, endTime: 5_000 },
    );
    expect(ingestion.upsertMany).toHaveBeenCalledTimes(2);
  });

  it('stops without persistence when Binance returns an empty page', async () => {
    const { service, binance, ingestion } = createService();
    binance.getKlines.mockResolvedValue([]);

    await expect(
      service.import({ symbol: 'ETHUSDT', interval: '1h', limit: 500, maxPages: 4 }),
    ).resolves.toEqual({
      symbol: 'ETHUSDT',
      interval: '1h',
      requestedPerPage: 500,
      imported: 0,
      pages: 0,
      startTime: undefined,
      endTime: undefined,
    });

    expect(binance.getKlines).toHaveBeenCalledTimes(1);
    expect(ingestion.upsertMany).not.toHaveBeenCalled();
  });

  it('rejects an empty symbol before requesting Binance data', async () => {
    const { service, binance, ingestion } = createService();

    await expect(service.import({ symbol: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(binance.getKlines).not.toHaveBeenCalled();
    expect(ingestion.upsertMany).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1001, 1.5])('rejects an invalid candle limit: %s', async (limit) => {
    const { service, binance, ingestion } = createService();

    await expect(service.import({ symbol: 'BTCUSDT', limit })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(binance.getKlines).not.toHaveBeenCalled();
    expect(ingestion.upsertMany).not.toHaveBeenCalled();
  });

  it.each([0, -1, 101, 1.5])('rejects an invalid maxPages value: %s', async (maxPages) => {
    const { service, binance, ingestion } = createService();

    await expect(
      service.import({ symbol: 'BTCUSDT', maxPages }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(binance.getKlines).not.toHaveBeenCalled();
    expect(ingestion.upsertMany).not.toHaveBeenCalled();
  });
});
