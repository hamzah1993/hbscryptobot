import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TradingEngineService } from './trading-engine.service';

@Controller('trading-engine')
@UseGuards(JwtAuthGuard)
export class TradingEngineController {
  constructor(private readonly engine: TradingEngineService) {}

  @Post('preview')
  preview(
    @Body()
    body: {
      riskBudgetQuote: number;
      baseOrderQuote: number;
      maxDcaOrders: number;
      dcaStepPercent: number;
      dcaMultiplier: number;
      takeProfitPercent: number;
      independentFromLevel: number;
    },
  ) {
    return this.engine.previewPlan(body);
  }
}
