import { Injectable } from '@nestjs/common';
import { RiskBudgetService, type DcaPlanInput } from './risk-budget.service';

@Injectable()
export class TradingEngineService {
  constructor(private readonly riskBudget: RiskBudgetService) {}

  previewPlan(input: DcaPlanInput) {
    const levels = this.riskBudget.buildPlan(input);
    const totalAllocatedQuote = levels.reduce((sum, level) => sum + level.quoteAmount, 0);

    return {
      levels,
      totalAllocatedQuote,
      unusedRiskBudgetQuote: Math.max(0, input.riskBudgetQuote - totalAllocatedQuote),
    };
  }
}
