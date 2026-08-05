import { BadRequestException } from '@nestjs/common';
import { BacktestCandleRunnerService } from './backtest-candle-runner.service';

describe('BacktestCandleRunnerService', () => {
  function createService() {
    const runs = {
      get: jest.fn(),
    };
    const execution = {
      start: jest.fn(),
      fail: jest.fn(),
    };
    const candles = {
      list: jest.fn(),
    };

    return {
      service: new BacktestCandleRunnerService(
        runs as any,
        execution as any,
        candles as any,
      ),
      runs,
      execution,
      candles,
    };
  }

  it('starts the run and loads its historical candle range', async () => {
    const { service, runs, execution, candles } = createService();
    const run = {
      id: 'run-1',
      exchange: 'BINANCE',
      symbol: 'BTCUSDT',
      interval: '5m',
      startTime: new Date('2026-08-01T00:00:00.000Z'),
      endTime: new Date('2026-08-02T00:00:00.000Z'),
    };
    const started = { ...run, status: 'RUNNING' };
    const historicalCandles = [{ id: 'candle-1' }, { id: 'candle-2' }];

    runs.get.mockResolvedValue(run);
    execution.start.mockResolvedValue(started);
    candles.list.mockResolvedValue(historicalCandles);

    await expect(service.run('user-1', 'run-1')).resolves.toEqual({
      run: started,
      candles: historicalCandles,
    });

    expect(runs.get).toHaveBeenCalledWith('user-1', 'run-1');
    expect(execution.start).toHaveBeenCalledWith('user-1', 'run-1');
    expect(candles.list).toHaveBeenCalledWith({
      exchange: 'BINANCE',
      symbol: 'BTCUSDT',
      interval: '5m',
      startTime: run.startTime,
      endTime: run.endTime,
      limit: 5000,
    });
    expect(execution.fail).not.toHaveBeenCalled();
  });

  it('marks the run failed when no historical candles are available', async () => {
    const { service, runs, execution, candles } = createService();
    const run = {
      id: 'run-1',
      exchange: 'BINANCE',
      symbol: 'ETHUSDT',
      interval: '1h',
      startTime: new Date('2026-08-01T00:00:00.000Z'),
      endTime: new Date('2026-08-02T00:00:00.000Z'),
    };

    runs.get.mockResolvedValue(run);
    execution.start.mockResolvedValue({ ...run, status: 'RUNNING' });
    candles.list.mockResolvedValue([]);
    execution.fail.mockResolvedValue({ id: 'run-1', status: 'FAILED' });

    await expect(service.run('user-1', 'run-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(execution.fail).toHaveBeenCalledWith(
      'run-1',
      expect.any(BadRequestException),
    );
  });

  it('marks the run failed when candle loading throws', async () => {
    const { service, runs, execution, candles } = createService();
    const run = {
      id: 'run-1',
      exchange: 'BINANCE',
      symbol: 'BTCUSDT',
      interval: '5m',
      startTime: new Date('2026-08-01T00:00:00.000Z'),
      endTime: new Date('2026-08-02T00:00:00.000Z'),
    };
    const error = new Error('Database unavailable');

    runs.get.mockResolvedValue(run);
    execution.start.mockResolvedValue({ ...run, status: 'RUNNING' });
    candles.list.mockRejectedValue(error);
    execution.fail.mockResolvedValue({ id: 'run-1', status: 'FAILED' });

    await expect(service.run('user-1', 'run-1')).rejects.toBe(error);
    expect(execution.fail).toHaveBeenCalledWith('run-1', error);
  });

  it('does not mark a run failed when lookup or start fails before candle loading', async () => {
    const { service, runs, execution, candles } = createService();
    const error = new Error('Pending run was not found');
    runs.get.mockRejectedValue(error);

    await expect(service.run('user-1', 'run-2')).rejects.toBe(error);
    expect(execution.start).not.toHaveBeenCalled();
    expect(candles.list).not.toHaveBeenCalled();
    expect(execution.fail).not.toHaveBeenCalled();
  });
});
