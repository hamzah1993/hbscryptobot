import { BadRequestException } from '@nestjs/common';
import { BacktestCandleRunnerService } from './backtest-candle-runner.service';

describe('BacktestCandleRunnerService', () => {
  function createService() {
    const runs = {
      get: jest.fn(),
    };
    const execution = {
      start: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
    };
    const candles = {
      list: jest.fn(),
    };
    const simulator = {
      simulate: jest.fn(),
    };

    return {
      service: new BacktestCandleRunnerService(
        runs as any,
        execution as any,
        candles as any,
        simulator as any,
      ),
      runs,
      execution,
      candles,
      simulator,
    };
  }

  it('starts, simulates, and completes the run from its historical candle range', async () => {
    const { service, runs, execution, candles, simulator } = createService();
    const run = {
      id: 'run-1',
      exchange: 'BINANCE',
      symbol: 'BTCUSDT',
      interval: '5m',
      startTime: new Date('2026-08-01T00:00:00.000Z'),
      endTime: new Date('2026-08-02T00:00:00.000Z'),
      initialCapital: '1000',
    };
    const historicalCandles = [{ close: '100' }, { close: '110' }];
    const result = {
      endingCapital: '1100.00000000',
      realizedPnlQuote: '100.00000000',
      returnPercent: '10.000000',
      maxDrawdownPercent: '0.000000',
      tradeCount: 1,
    };
    const completed = { ...run, status: 'COMPLETED', ...result };

    runs.get.mockResolvedValue(run);
    execution.start.mockResolvedValue({ ...run, status: 'RUNNING' });
    candles.list.mockResolvedValue(historicalCandles);
    simulator.simulate.mockReturnValue(result);
    execution.complete.mockResolvedValue(completed);

    await expect(service.run('user-1', 'run-1')).resolves.toEqual(completed);

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
    expect(simulator.simulate).toHaveBeenCalledWith({
      initialCapital: '1000',
      candles: historicalCandles,
    });
    expect(execution.complete).toHaveBeenCalledWith('run-1', result);
    expect(execution.fail).not.toHaveBeenCalled();
  });

  it('marks the run failed when no historical candles are available', async () => {
    const { service, runs, execution, candles, simulator } = createService();
    const run = {
      id: 'run-1',
      exchange: 'BINANCE',
      symbol: 'ETHUSDT',
      interval: '1h',
      startTime: new Date('2026-08-01T00:00:00.000Z'),
      endTime: new Date('2026-08-02T00:00:00.000Z'),
      initialCapital: '1000',
    };

    runs.get.mockResolvedValue(run);
    execution.start.mockResolvedValue({ ...run, status: 'RUNNING' });
    candles.list.mockResolvedValue([]);
    execution.fail.mockResolvedValue({ id: 'run-1', status: 'FAILED' });

    await expect(service.run('user-1', 'run-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(simulator.simulate).not.toHaveBeenCalled();
    expect(execution.complete).not.toHaveBeenCalled();
    expect(execution.fail).toHaveBeenCalledWith(
      'run-1',
      expect.any(BadRequestException),
    );
  });

  it('marks the run failed when candle loading throws', async () => {
    const { service, runs, execution, candles, simulator } = createService();
    const run = {
      id: 'run-1',
      exchange: 'BINANCE',
      symbol: 'BTCUSDT',
      interval: '5m',
      startTime: new Date('2026-08-01T00:00:00.000Z'),
      endTime: new Date('2026-08-02T00:00:00.000Z'),
      initialCapital: '1000',
    };
    const error = new Error('Database unavailable');

    runs.get.mockResolvedValue(run);
    execution.start.mockResolvedValue({ ...run, status: 'RUNNING' });
    candles.list.mockRejectedValue(error);
    execution.fail.mockResolvedValue({ id: 'run-1', status: 'FAILED' });

    await expect(service.run('user-1', 'run-1')).rejects.toBe(error);
    expect(simulator.simulate).not.toHaveBeenCalled();
    expect(execution.complete).not.toHaveBeenCalled();
    expect(execution.fail).toHaveBeenCalledWith('run-1', error);
  });

  it('marks the run failed when simulation throws', async () => {
    const { service, runs, execution, candles, simulator } = createService();
    const run = {
      id: 'run-1',
      exchange: 'BINANCE',
      symbol: 'BTCUSDT',
      interval: '5m',
      startTime: new Date('2026-08-01T00:00:00.000Z'),
      endTime: new Date('2026-08-02T00:00:00.000Z'),
      initialCapital: '1000',
    };
    const historicalCandles = [{ close: '100' }];
    const error = new Error('Simulation failed');

    runs.get.mockResolvedValue(run);
    execution.start.mockResolvedValue({ ...run, status: 'RUNNING' });
    candles.list.mockResolvedValue(historicalCandles);
    simulator.simulate.mockImplementation(() => {
      throw error;
    });
    execution.fail.mockResolvedValue({ id: 'run-1', status: 'FAILED' });

    await expect(service.run('user-1', 'run-1')).rejects.toBe(error);
    expect(execution.complete).not.toHaveBeenCalled();
    expect(execution.fail).toHaveBeenCalledWith('run-1', error);
  });

  it('does not mark a run failed when lookup or start fails before candle loading', async () => {
    const { service, runs, execution, candles, simulator } = createService();
    const error = new Error('Pending run was not found');
    runs.get.mockRejectedValue(error);

    await expect(service.run('user-1', 'run-2')).rejects.toBe(error);
    expect(execution.start).not.toHaveBeenCalled();
    expect(candles.list).not.toHaveBeenCalled();
    expect(simulator.simulate).not.toHaveBeenCalled();
    expect(execution.complete).not.toHaveBeenCalled();
    expect(execution.fail).not.toHaveBeenCalled();
  });
});
