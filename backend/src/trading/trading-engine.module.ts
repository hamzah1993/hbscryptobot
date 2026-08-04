import { Module } from '@nestjs/common';
import { BinanceModule } from '../exchange/binance/binance.module';
import { MarketDataModule } from '../market/market-data.module';
import { PaperStrategyRunnerService } from './paper-strategy-runner.service';
import { PaperStrategySchedulerService } from './paper-strategy-scheduler.service';
import { PaperTradingController } from './paper-trading.controller';
import { PaperTradingService } from './paper-trading.service';
import { RiskBudgetService } from './risk-budget.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { TestnetOrderSyncSchedulerService } from './testnet-order-sync-scheduler.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';
import { TradingEngineController } from './trading-engine.controller';
import { TradingEngineService } from './trading-engine.service';

@Module({
  imports: [MarketDataModule, BinanceModule],
  controllers: [TradingEngineController, PaperTradingController, StrategyController],
  providers: [
    RiskBudgetService,
    TradingEngineService,
    PaperTradingService,
    StrategyService,
    PaperStrategyRunnerService,
    PaperStrategySchedulerService,
    TestnetStrategyExecutionService,
    TestnetOrderSyncSchedulerService,
  ],
  exports: [
    RiskBudgetService,
    TradingEngineService,
    PaperTradingService,
    StrategyService,
    PaperStrategyRunnerService,
    TestnetStrategyExecutionService,
  ],
})
export class TradingEngineModule {}
