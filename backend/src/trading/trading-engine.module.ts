import { Module } from '@nestjs/common';
import { RiskBudgetService } from './risk-budget.service';
import { TradingEngineController } from './trading-engine.controller';
import { TradingEngineService } from './trading-engine.service';

@Module({
  controllers: [TradingEngineController],
  providers: [RiskBudgetService, TradingEngineService],
  exports: [RiskBudgetService, TradingEngineService],
})
export class TradingEngineModule {}
