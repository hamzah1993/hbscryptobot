import { BacktestRunStatus } from '@prisma/client';
import { BacktestRunRecoveryScheduler } from './backtest-run-recovery.scheduler';

describe('BacktestRunRecoveryScheduler', () => {
  it('fails only backtests that have remained running past the execution window', async () => {
    const backtestRun = { updateMany: jest.fn().mockResolvedValue({ count: 2 }) };
    const service = new BacktestRunRecoveryScheduler({ backtestRun } as any);

    await expect(service.failStaleRuns()).resolves.toBe(2);

    expect(backtestRun.updateMany).toHaveBeenCalledWith({
      where: {
        status: BacktestRunStatus.RUNNING,
        startedAt: { lt: expect.any(Date) },
      },
      data: {
        status: BacktestRunStatus.FAILED,
        completedAt: expect.any(Date),
        errorMessage: 'Backtest exceeded the execution time limit. Create a new run to retry.',
      },
    });
  });
});
