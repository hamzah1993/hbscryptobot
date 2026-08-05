import { BadRequestException, Injectable } from '@nestjs/common';

export type FillAccountingContext = {
  order: any;
  position: any;
  subPosition: any | null;
  strategy: any;
  deltaQuantity: number;
  deltaQuote: number;
  averageFillPrice: number;
};

@Injectable()
export class TestnetFillAccountingService {
  async apply(tx: any, context: FillAccountingContext) {
    const { order, position, subPosition, strategy, deltaQuantity, deltaQuote, averageFillPrice } = context;
    if (!Number.isFinite(deltaQuantity) || deltaQuantity < 0) {
      throw new BadRequestException('Fill quantity delta must be a non-negative number');
    }
    if (!Number.isFinite(deltaQuote) || deltaQuote < 0) {
      throw new BadRequestException('Fill quote delta must be a non-negative number');
    }
    if (deltaQuantity === 0) return { position, subPosition };

    const independentEntry = order.independent && order.side === 'BUY';
    const independentExit = order.independent && order.side === 'SELL';

    if (independentEntry) {
      const level = Number(order.level);
      const existing = subPosition ?? (await tx.tradingSubPosition.findUnique({
        where: { positionId_level: { positionId: position.id, level } },
      }));
      const previousQuantity = Number(existing?.quantity ?? 0);
      const previousCost = Number(existing?.costQuote ?? 0);
      const quantity = previousQuantity + deltaQuantity;
      const costQuote = previousCost + deltaQuote;
      const entryPrice = quantity > 0 ? costQuote / quantity : averageFillPrice;
      const takeProfitPrice = entryPrice * (1 + Number(strategy.takeProfitPercent) / 100);
      const saved = existing
        ? await tx.tradingSubPosition.update({
            where: { id: existing.id },
            data: { status: 'OPEN', quantity, costQuote, entryPrice, takeProfitPrice, closedAt: null },
          })
        : await tx.tradingSubPosition.create({
            data: { positionId: position.id, level, status: 'OPEN', quantity, costQuote, entryPrice, takeProfitPrice },
          });
      return { position, subPosition: saved };
    }

    if (independentExit) {
      if (!subPosition) throw new BadRequestException('Independent sub-position is required for fill accounting');
      const previousQuantity = Number(subPosition.quantity);
      const previousCost = Number(subPosition.costQuote);
      const soldQuantity = Math.min(deltaQuantity, previousQuantity);
      const allocatedCost = previousQuantity > 0 ? (previousCost * soldQuantity) / previousQuantity : 0;
      const proceeds = deltaQuote > 0 ? deltaQuote : soldQuantity * averageFillPrice;
      const remainingQuantity = Math.max(previousQuantity - soldQuantity, 0);
      const remainingCost = Math.max(previousCost - allocatedCost, 0);
      const closed = remainingQuantity <= 1e-12;
      const saved = await tx.tradingSubPosition.update({
        where: { id: subPosition.id },
        data: {
          status: closed ? 'CLOSED' : 'OPEN',
          quantity: closed ? 0 : remainingQuantity,
          costQuote: closed ? 0 : remainingCost,
          entryPrice: closed ? 0 : remainingCost / remainingQuantity,
          realizedPnlQuote: Number(subPosition.realizedPnlQuote) + proceeds - allocatedCost,
          closedAt: closed ? new Date() : null,
        },
      });
      return { position, subPosition: saved };
    }

    if (order.side === 'BUY') {
      const previousQuantity = Number(position.totalQuantity);
      const previousCost = Number(position.totalCostQuote);
      const totalQuantity = previousQuantity + deltaQuantity;
      const totalCostQuote = previousCost + deltaQuote;
      const averageEntryPrice = totalQuantity > 0 ? totalCostQuote / totalQuantity : 0;
      const dcaCount = Number(position.dcaCount) + (order.level > 1 && Number(order.accountedFilledQuantity ?? 0) === 0 ? 1 : 0);
      const nextStepMultiplier = Math.pow(Number(strategy.dcaMultiplier), dcaCount);
      const nextDcaPrice = averageEntryPrice * (1 - (Number(strategy.dcaStepPercent) * nextStepMultiplier) / 100);
      const takeProfitPrice = averageEntryPrice * (1 + Number(strategy.takeProfitPercent) / 100);
      const saved = await tx.tradingPosition.update({
        where: { id: position.id },
        data: { totalQuantity, totalCostQuote, averageEntryPrice, dcaCount, nextDcaPrice, takeProfitPrice },
      });
      return { position: saved, subPosition };
    }

    const previousQuantity = Number(position.totalQuantity);
    const previousCost = Number(position.totalCostQuote);
    const soldQuantity = Math.min(deltaQuantity, previousQuantity);
    const allocatedCost = previousQuantity > 0 ? (previousCost * soldQuantity) / previousQuantity : 0;
    const proceeds = deltaQuote > 0 ? deltaQuote : soldQuantity * averageFillPrice;
    const remainingQuantity = Math.max(previousQuantity - soldQuantity, 0);
    const remainingCost = Math.max(previousCost - allocatedCost, 0);
    const closed = remainingQuantity <= 1e-12;
    const averageEntryPrice = closed ? 0 : remainingCost / remainingQuantity;
    const nextStepMultiplier = Math.pow(Number(strategy.dcaMultiplier), Number(position.dcaCount));
    const saved = await tx.tradingPosition.update({
      where: { id: position.id },
      data: {
        status: closed ? 'CLOSED' : 'OPEN',
        totalQuantity: closed ? 0 : remainingQuantity,
        totalCostQuote: closed ? 0 : remainingCost,
        averageEntryPrice,
        realizedPnlQuote: Number(position.realizedPnlQuote) + proceeds - allocatedCost,
        closedAt: closed ? new Date() : null,
        nextDcaPrice: closed ? null : averageEntryPrice * (1 - (Number(strategy.dcaStepPercent) * nextStepMultiplier) / 100),
        takeProfitPrice: closed ? null : averageEntryPrice * (1 + Number(strategy.takeProfitPercent) / 100),
      },
    });
    return { position: saved, subPosition };
  }
}
