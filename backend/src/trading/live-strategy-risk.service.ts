import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TestnetRiskActionType, TestnetStrategyRiskService } from './testnet-strategy-risk.service';

/**
 * Final server-side risk boundary for every Binance LIVE submission.
 * LIVE exposure is allowed without the operational production-readiness gate,
 * but fixed strategy limits and the user-wide capital ceiling remain enforced.
 */
@Injectable()
export class LiveStrategyRiskService extends TestnetStrategyRiskService {
  protected override get expectedMode(): 'BINANCE_LIVE' {
    return 'BINANCE_LIVE';
  }

  protected override get expectedEnvironment(): 'LIVE' {
    return 'LIVE';
  }

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  override async assertCanExecute(
    userId: string,
    strategy: any,
    openPosition: any | null,
    actionType: TestnetRiskActionType,
    estimatedOrderQuote: number,
    _retrying = false,
  ) {
    const isEntry = !actionType || ['INITIAL_ENTRY', 'DCA_ENTRY', 'INDEPENDENT_ENTRY', 'RECOVERY_DCA_ENTRY'].includes(actionType);

    if (isEntry) {
      const liveSafetyProfile = await this.prisma.liveTradingSafetyProfile.findUnique({ where: { userId } });
      const capitalCeiling = Number(liveSafetyProfile?.capitalCeilingQuote ?? 0);
      if (!Number.isFinite(capitalCeiling) || capitalCeiling <= 0) {
        throw new ConflictException('Binance LIVE capital ceiling is not configured');
      }

      const [positions, pendingBuys] = await Promise.all([
        this.prisma.tradingPosition.findMany({
          where: { userId, status: 'OPEN', strategy: { exchange: 'BINANCE', environment: 'LIVE', paperTrading: false } },
          select: {
            totalCostQuote: true,
            subPositions: { where: { status: 'OPEN' }, select: { costQuote: true } },
          },
        }),
        this.prisma.tradingOrder.findMany({
          where: {
            userId,
            side: 'BUY',
            status: { in: ['PENDING', 'PARTIALLY_FILLED'] },
            position: { strategy: { exchange: 'BINANCE', environment: 'LIVE', paperTrading: false } },
          },
          select: { quantity: true, filledQuantity: true, price: true },
        }),
      ]);

      const openExposure = positions.reduce((sum, position) => (
        sum
        + Number(position.totalCostQuote)
        + position.subPositions.reduce((subSum, sub) => subSum + Number(sub.costQuote), 0)
      ), 0);
      const pendingExposure = pendingBuys.reduce((sum, order) => {
        const price = Number(order.price ?? 0);
        const remainingQuantity = Math.max(Number(order.quantity) - Number(order.filledQuantity), 0);
        // A pending market BUY has no durable limit price. Fail closed instead
        // of pretending its remaining exposure is zero.
        if (remainingQuantity > 0 && (!Number.isFinite(price) || price <= 0)) return Number.POSITIVE_INFINITY;
        return sum + remainingQuantity * price;
      }, 0);
      const projectedExposure = openExposure + pendingExposure + Math.max(estimatedOrderQuote, 0);
      if (!Number.isFinite(projectedExposure) || projectedExposure > capitalCeiling + Number.EPSILON) {
        throw new BadRequestException('Order would exceed the configured Binance LIVE capital ceiling');
      }
    }

    await super.assertCanExecute(userId, strategy, openPosition, actionType, estimatedOrderQuote);
  }
}
