import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TestnetActionTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, limit = 100) {
    return this.prisma.strategyAction.findMany({
      where: {
        userId,
        strategy: {
          environment: 'TESTNET',
          paperTrading: false,
        },
      },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
            symbol: true,
            status: true,
            environment: true,
            paperTrading: true,
          },
        },
        position: {
          select: {
            id: true,
            symbol: true,
            status: true,
          },
        },
        subPosition: {
          select: {
            id: true,
            level: true,
            status: true,
          },
        },
        order: {
          select: {
            id: true,
            exchangeOrderId: true,
            clientOrderId: true,
            status: true,
            filledQuantity: true,
            quoteAmount: true,
            averageFillPrice: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
