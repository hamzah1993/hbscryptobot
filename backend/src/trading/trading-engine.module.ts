import { Module } from '@nestjs/common';
import { PaperTradingController } from './paper-trading.controller';
import { PaperTradingService } from './paper-trading.service';
import { RiskBudgetService } from './risk-budget.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { TradingEngineController } from './trading-engine.controller';
import { TradingEngineService } from './trading-engine.service';

@Module({
  controllers: [TradingEngineController, PaperTradingController, StrategyController],
  providers: [RiskBudgetService, TradingEngineService, PaperTradingService, StrategyService],
  exports: [RiskBudgetService, TradingEngineService, PaperTradingService, StrategyService],
})
export class TradingEngineModule {}
