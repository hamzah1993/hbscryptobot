import { NotFoundException } from '@nestjs/common';
import { BacktestRunStatus } from '@prisma/client';
import { BacktestExecutionService } from './backtest-execution.service';

describe('BacktestExecutionService', () => {
  function createService() {
    const backtestRun = {
      findFirst: jest.fn(),
      update: jest.fn(),
    };
    const prisma = { backtestRun } as any;

    return {
      service: new BacktestExecutionService(prisma),
      backtestRun,
    };
  }

  it('starts a user-owned pending run', async () => {
    const { service, backtestRun } = createService();
    backtestRun.findFirst.mockResolvedValue({ id: 'run-1' });
    backtestRun.update.mockResolvedValue({
      id: 'run-1',
      status: BacktestRunStatus.RUNNING,
    });

    await expect(service.start('user-1', ' run-1 ')).resolves.toEqual({
      id: 'run-1',
      status: BacktestRunStatus.RUNNING,
    });

    expect(backtestRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'run-1',
        userId: 'user-1',
        status: BacktestRunStatus.PENDING,
      },
    });
    expect(backtestRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: BacktestRunStatus.RUNNING,
        startedAt: expect.any(Date),
        errorMessage: null,
      },
    });
  });

  it('rejects a missing or non-pending run', async () => {
    const { service, backtestRun } = createService();
    backtestRun.findFirst.mockResolvedValue(null);

    await expect(service.start('user-1', 'run-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(backtestRun.update).not.toHaveBeenCalled();
  });

  it('completes a run with calculated metrics', async () => {
    const { service, backtestRun } = createService();
    const result = {
      endingCapital: '1125.50',
      realizedPnlQuote: '125.50',
      returnPercent: '12.55',
      maxDrawdownPercent: '4.25',
      tradeCount: 9,
    };
    backtestRun.update.mockResolvedValue({
      id: 'run-1',
      status: BacktestRunStatus.COMPLETED,
    });

    await expect(service.complete('run-1', result)).resolves.toEqual({
      id: 'run-1',
      status: BacktestRunStatus.COMPLETED,
    });

    expect(backtestRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: BacktestRunStatus.COMPLETED,
        ...result,
        completedAt: expect.any(Date),
        errorMessage: null,
      },
    });
  });

  it('marks a run failed with an Error message', async () => {
    const { service, backtestRun } = createService();
    backtestRun.update.mockResolvedValue({
      id: 'run-1',
      status: BacktestRunStatus.FAILED,
    });

    await expect(
      service.fail('run-1', new Error('Historical candles are unavailable')),
    ).resolves.toEqual({
      id: 'run-1',
      status: BacktestRunStatus.FAILED,
    });

    expect(backtestRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: BacktestRunStatus.FAILED,
        errorMessage: 'Historical candles are unavailable',
        completedAt: expect.any(Date),
      },
    });
  });

  it('uses a safe fallback message for unknown failure values', async () => {
    const { service, backtestRun } = createService();
    backtestRun.update.mockResolvedValue({ id: 'run-1' });

    await service.fail('run-1', { reason: 'unknown' });

    expect(backtestRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: {
        status: BacktestRunStatus.FAILED,
        errorMessage: 'Backtest execution failed',
        completedAt: expect.any(Date),
      },
    });
  });
});
