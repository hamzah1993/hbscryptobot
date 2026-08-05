import { Module } from '@nestjs/common';
import { BinanceModule } from '../exchange/binance/binance.module';
import { MarketDataModule } from '../market/market-data.module';
import { BacktestRunController } from './backtest-run.controller';
import { BacktestRunService } from './backtest-run.service';
import { BinanceHistoricalCandleImporterService } from './binance-historical-candle-importer.service';
import { HistoricalCandleController } from './historical-candle.controller';
import { HistoricalCandleIngestionService } from './historical-candle-ingestion.service';
import { HistoricalCandleQueryService } from './historical-candle-query.service';
import { PaperStrategyRunnerService } from './paper-strategy-runner.service';
import { PaperStrategySchedulerService } from './paper-strategy-scheduler.service';
import { PaperTradingController } from './paper-trading.controller';
import { PaperTradingService } from './paper-trading.service';
import { RiskBudgetService } from './risk-budget.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { TestnetActionTimelineService } from './testnet-action-timeline.service';
import { TestnetEmergencyStopService } from './testnet-emergency-stop.service';
import { TestnetOrderSyncSchedulerService } from './testnet-order-sync-scheduler.service';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';
import { TestnetStrategyRunnerService } from './testnet-strategy-runner.service';
import { TestnetStrategySchedulerService } from './testnet-strategy-scheduler.service';
import { TradingEngineController } from './trading-engine.controller';
import { TradingEngineService } from './trading-engine.service';

@Module({
  imports: [MarketDataModule, BinanceModule],
  controllers: [
    TradingEngineController,
    PaperTradingController,
    StrategyController,
    HistoricalCandleController,
    BacktestRunController,
  ],
  providers: [
    RiskBudgetService,
    TradingEngineService,
    PaperTradingService,
    StrategyService,
    HistoricalCandleIngestionService,
    HistoricalCandleQueryService,
    BinanceHistoricalCandleImporterService,
    BacktestRunService,
    PaperStrategyRunnerService,
    PaperStrategySchedulerService,
    TestnetStrategyExecutionService,
    TestnetOrderSyncSchedulerService,
    TestnetStrategyActionService,
    TestnetActionTimelineService,
    TestnetEmergencyStopService,
    TestnetStrategyRunnerService,
    TestnetStrategySchedulerService,
  ],
  exports: [
    RiskBudgetService,
    TradingEngineService,
    PaperTradingService,
    StrategyService,
    HistoricalCandleIngestionService,
    HistoricalCandleQueryService,
    BinanceHistoricalCandleImporterService,
    BacktestRunService,
    PaperStrategyRunnerService,
    TestnetStrategyExecutionService,
    TestnetStrategyActionService,
    TestnetActionTimelineService,
    TestnetEmergencyStopService,
    TestnetStrategyRunnerService,
  ],
})
export class TradingEngineModule {}
