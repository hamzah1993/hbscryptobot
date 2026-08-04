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

  it('normalizes defaults and imports Binance candles', async () => {
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
      requested: 200,
      imported: 1,
    });

    expect(binance.getKlines).toHaveBeenCalledWith('BTCUSDT', '5m', 200, 'live');
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

  it('passes an explicit interval and limit through to Binance', async () => {
    const { service, binance, ingestion } = createService();
    binance.getKlines.mockResolvedValue([]);
    ingestion.upsertMany.mockResolvedValue(0);

    await expect(
      service.import({ symbol: 'ETHUSDT', interval: '1h', limit: 500 }),
    ).resolves.toEqual({
      symbol: 'ETHUSDT',
      interval: '1h',
      requested: 500,
      imported: 0,
    });

    expect(binance.getKlines).toHaveBeenCalledWith('ETHUSDT', '1h', 500, 'live');
    expect(ingestion.upsertMany).toHaveBeenCalledWith([]);
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
});
