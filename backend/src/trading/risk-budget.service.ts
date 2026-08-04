import { BadRequestException, Injectable } from '@nestjs/common';

export interface DcaPlanInput {
  riskBudgetQuote: number;
  baseOrderQuote: number;
  maxDcaOrders: number;
  dcaStepPercent: number;
  dcaMultiplier: number;
  takeProfitPercent: number;
  independentFromLevel: number;
}

export interface PlannedLevel {
  level: number;
  quoteAmount: number;
  triggerDropPercent: number;
  independent: boolean;
}

@Injectable()
export class RiskBudgetService {
  buildPlan(input: DcaPlanInput): PlannedLevel[] {
    this.validate(input);

    const levels: PlannedLevel[] = [];
    let allocated = 0;

    for (let level = 1; level <= input.maxDcaOrders + 1; level += 1) {
      const rawAmount = input.baseOrderQuote * input.dcaMultiplier ** (level - 1);
      const remaining = input.riskBudgetQuote - allocated;
      if (remaining <= 0) break;

      const quoteAmount = Math.min(rawAmount, remaining);
      levels.push({
        level,
        quoteAmount: this.round(quoteAmount),
        triggerDropPercent: this.round(input.dcaStepPercent * (level - 1), 4),
        independent: level >= input.independentFromLevel,
      });

      allocated += quoteAmount;
      if (quoteAmount < rawAmount) break;
    }

    if (levels.length === 0) {
      throw new BadRequestException('Risk budget cannot fund the base order');
    }

    return levels;
  }

  assertWithinBudget(plannedQuote: number, alreadyAllocatedQuote: number, riskBudgetQuote: number) {
    if (plannedQuote <= 0) throw new BadRequestException('Order allocation must be positive');
    if (alreadyAllocatedQuote + plannedQuote > riskBudgetQuote + Number.EPSILON) {
      throw new BadRequestException('Order would exceed the configured risk budget');
    }
  }

  private validate(input: DcaPlanInput) {
    if (input.riskBudgetQuote <= 0) throw new BadRequestException('Risk budget must be positive');
    if (input.baseOrderQuote <= 0) throw new BadRequestException('Base order must be positive');
    if (input.maxDcaOrders < 0 || input.maxDcaOrders > 50) {
      throw new BadRequestException('maxDcaOrders must be between 0 and 50');
    }
    if (input.dcaStepPercent <= 0) throw new BadRequestException('DCA step must be positive');
    if (input.dcaMultiplier < 1) throw new BadRequestException('DCA multiplier cannot be below 1');
    if (input.takeProfitPercent <= 0) throw new BadRequestException('Take-profit must be positive');
    if (input.independentFromLevel < 1) {
      throw new BadRequestException('Independent level must be at least 1');
    }
  }

  private round(value: number, digits = 8) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }
}
