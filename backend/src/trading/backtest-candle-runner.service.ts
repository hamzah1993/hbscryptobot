import { BadRequestException, Injectable } from '@nestjs/common';
import { BacktestExecutionService } from './backtest-execution.service';
import { BacktestRunService } from './backtest-run.service';
import { HistoricalCandleQueryService } from './historical-candle-query.service';

@Injectable()
export class BacktestCandleRunnerService {
  constructor(
    private readonly runs: BacktestRunService,
    private readonly execution: BacktestExecutionService,
    private readonly candles: HistoricalCandleQueryService,
  ) {}

  async run(userId: string, runId: string) {
    const run = await this.runs.get(userId, runId);
    const started = await this.execution.start(userId, run.id);

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

      return {
        run: started,
        candles,
      };
    } catch (error) {
      await this.execution.fail(run.id, error);
      throw error;
    }
  }
}
