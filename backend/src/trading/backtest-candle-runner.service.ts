import { BadRequestException, Injectable } from '@nestjs/common';
import { BacktestBuyHoldSimulatorService } from './backtest-buy-hold-simulator.service';
import { BacktestExecutionService } from './backtest-execution.service';
import { BacktestRunService } from './backtest-run.service';
import { HistoricalCandleQueryService } from './historical-candle-query.service';

@Injectable()
export class BacktestCandleRunnerService {
  constructor(
    private readonly runs: BacktestRunService,
    private readonly execution: BacktestExecutionService,
    private readonly candles: HistoricalCandleQueryService,
    private readonly simulator: BacktestBuyHoldSimulatorService,
  ) {}

  async run(userId: string, runId: string) {
    const run = await this.runs.get(userId, runId);
    await this.execution.start(userId, run.id);

    try {
      const candles = await this.candles.list({
        exchange: run.exchange,
        symbol: run.symbol,
        interval: run.interval,
        startTime: run.startTime,
        endTime: run.endTime,
        limit: 5000,
      });

      if (candles.length === 0) {
        throw new BadRequestException(
          'No historical candles were found for the requested backtest range',
        );
      }

      const result = this.simulator.simulate({
        initialCapital: run.initialCapital,
        candles,
      });

      return this.execution.complete(run.id, result);
    } catch (error) {
      await this.execution.fail(run.id, error);
      throw error;
    }
  }
}
