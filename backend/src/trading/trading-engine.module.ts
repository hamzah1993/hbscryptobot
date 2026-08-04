import { Module } from '@nestjs/common';
import { BinanceModule } from '../exchange/binance/binance.module';
import { MarketDataModule } from '../market/market-data.module';
import { BinanceHistoricalCandleImporterService } from './binance-historical-candle-importer.service';
import { HistoricalCandleController } from './historical-candle.controller';
import { HistoricalCandleIngestionService } from './historical-candle-ingestion.service';
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
  ],
  providers: [
    RiskBudgetService,
    TradingEngineService,
    PaperTradingService,
    StrategyService,
    HistoricalCandleIngestionService,
    BinanceHistoricalCandleImporterService,
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
    BinanceHistoricalCandleImporterService,
    PaperStrategyRunnerService,
    TestnetStrategyExecutionService,
    TestnetStrategyActionService,
    TestnetActionTimelineService,
    TestnetEmergencyStopService,
    TestnetStrategyRunnerService,
  ],
})
export class TradingEngineModule {}
