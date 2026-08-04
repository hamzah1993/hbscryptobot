import { Module } from '@nestjs/common';
import { PaperTradingController } from './paper-trading.controller';
import { PaperTradingService } from './paper-trading.service';
import { RiskBudgetService } from './risk-budget.service';
import { TradingEngineController } from './trading-engine.controller';
import { TradingEngineService } from './trading-engine.service';

@Module({
  controllers: [TradingEngineController, PaperTradingController],
  providers: [RiskBudgetService, TradingEngineService, PaperTradingService],
  exports: [RiskBudgetService, TradingEngineService, PaperTradingService],
})
export class TradingEngineModule {}
