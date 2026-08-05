import { NotFoundException } from '@nestjs/common';
import { BacktestRunStatus } from '@prisma/client';
import { BacktestExecutionService } from './backtest-execution.service';

describe('BacktestExecutionService', () => {
  function createService() {
    const backtestRun = {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    const prisma = { backtestRun } as any;

    return {
      service: new BacktestExecutionService(prisma),
      backtestRun,
    };
  }

  it('atomically starts a user-owned pending run', async () => {
    const { service, backtestRun } = createService();
    const started = {
      id: 'run-1',
      status: BacktestRunStatus.RUNNING,
    };

    backtestRun.updateMany.mockResolvedValue({ count: 1 });
    backtestRun.findFirst.mockResolvedValue(started);

    await expect(service.start('user-1', ' run-1 ')).resolves.toEqual(started);

    expect(backtestRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        userId: 'user-1',
        status: BacktestRunStatus.PENDING,
      },
      data: {
        status: BacktestRunStatus.RUNNING,
        startedAt: expect.any(Date),
        errorMessage: null,
      },
    });

    const startedAt = backtestRun.updateMany.mock.calls[0][0].data.startedAt;
    expect(backtestRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        userId: 'user-1',
        status: BacktestRunStatus.RUNNING,
        startedAt,
      },
    });
    expect(backtestRun.update).not.toHaveBeenCalled();
  });

  it('rejects a missing, foreign-owned, or non-pending run', async () => {
    const { service, backtestRun } = createService();
    backtestRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.start('user-1', 'run-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(backtestRun.findFirst).not.toHaveBeenCalled();
    expect(backtestRun.update).not.toHaveBeenCalled();
  });

  it('rejects when the transitioned run cannot be reloaded', async () => {
    const { service, backtestRun } = createService();
    backtestRun.updateMany.mockResolvedValue({ count: 1 });
    backtestRun.findFirst.mockResolvedValue(null);

    await expect(service.start('user-1', 'run-1')).rejects.toThrow(
      'Started backtest run was not found',
    );
  });

  it('atomically completes a running run with calculated metrics', async () => {
    const { service, backtestRun } = createService();
    const result = {
      endingCapital: '1125.50',
      realizedPnlQuote: '125.50',
      returnPercent: '12.55',
      maxDrawdownPercent: '4.25',
      tradeCount: 9,
    };
    const completed = {
      id: 'run-1',
      status: BacktestRunStatus.COMPLETED,
    };

    backtestRun.updateMany.mockResolvedValue({ count: 1 });
    backtestRun.findFirst.mockResolvedValue(completed);

    await expect(service.complete(' run-1 ', result)).resolves.toEqual(completed);

    expect(backtestRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        status: BacktestRunStatus.RUNNING,
      },
      data: {
        status: BacktestRunStatus.COMPLETED,
        ...result,
        completedAt: expect.any(Date),
        errorMessage: null,
      },
    });

    const completedAt = backtestRun.updateMany.mock.calls[0][0].data.completedAt;
    expect(backtestRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        status: BacktestRunStatus.COMPLETED,
        completedAt,
      },
    });
    expect(backtestRun.update).not.toHaveBeenCalled();
  });

  it('rejects completion when the run is not running', async () => {
    const { service, backtestRun } = createService();
    backtestRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.complete('run-1', {
        endingCapital: '1000',
        realizedPnlQuote: '0',
        returnPercent: '0',
        maxDrawdownPercent: '0',
        tradeCount: 1,
      }),
    ).rejects.toThrow('Running backtest run was not found');

    expect(backtestRun.findFirst).not.toHaveBeenCalled();
  });

  it('rejects when a completed run cannot be reloaded', async () => {
    const { service, backtestRun } = createService();
    backtestRun.updateMany.mockResolvedValue({ count: 1 });
    backtestRun.findFirst.mockResolvedValue(null);

    await expect(
      service.complete('run-1', {
        endingCapital: '1000',
        realizedPnlQuote: '0',
        returnPercent: '0',
        maxDrawdownPercent: '0',
        tradeCount: 1,
      }),
    ).rejects.toThrow('Completed backtest run was not found');
  });

  it('atomically marks a running run failed with an Error message', async () => {
    const { service, backtestRun } = createService();
    const failed = {
      id: 'run-1',
      status: BacktestRunStatus.FAILED,
    };

    backtestRun.updateMany.mockResolvedValue({ count: 1 });
    backtestRun.findFirst.mockResolvedValue(failed);

    await expect(
      service.fail(' run-1 ', new Error('Historical candles are unavailable')),
    ).resolves.toEqual(failed);

    expect(backtestRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        status: BacktestRunStatus.RUNNING,
      },
      data: {
        status: BacktestRunStatus.FAILED,
        errorMessage: 'Historical candles are unavailable',
        completedAt: expect.any(Date),
      },
    });

    const completedAt = backtestRun.updateMany.mock.calls[0][0].data.completedAt;
    expect(backtestRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        status: BacktestRunStatus.FAILED,
        completedAt,
      },
    });
    expect(backtestRun.update).not.toHaveBeenCalled();
  });

  it('uses a safe fallback message for unknown failure values', async () => {
    const { service, backtestRun } = createService();
    backtestRun.updateMany.mockResolvedValue({ count: 1 });
    backtestRun.findFirst.mockResolvedValue({ id: 'run-1' });

    await service.fail('run-1', { reason: 'unknown' });

    expect(backtestRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        status: BacktestRunStatus.RUNNING,
      },
      data: {
        status: BacktestRunStatus.FAILED,
        errorMessage: 'Backtest execution failed',
        completedAt: expect.any(Date),
      },
    });
  });

  it('rejects failure when the run is not running', async () => {
    const { service, backtestRun } = createService();
    backtestRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.fail('run-1', new Error('failed'))).rejects.toThrow(
      'Running backtest run was not found',
    );

    expect(backtestRun.findFirst).not.toHaveBeenCalled();
  });

  it('rejects when a failed run cannot be reloaded', async () => {
    const { service, backtestRun } = createService();
    backtestRun.updateMany.mockResolvedValue({ count: 1 });
    backtestRun.findFirst.mockResolvedValue(null);

    await expect(service.fail('run-1', new Error('failed'))).rejects.toThrow(
      'Failed backtest run was not found',
    );
  });
});
