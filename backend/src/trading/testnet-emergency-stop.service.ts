import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TestnetEmergencyStopService {
  constructor(private readonly prisma: PrismaService) {}

  async stopUserStrategies(userId: string) {
    const stoppedAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const strategies = await tx.tradingStrategy.updateMany({
        where: {
          userId,
          environment: 'TESTNET',
          paperTrading: false,
          status: { in: ['RUNNING', 'PAUSED'] },
        },
        data: { status: 'STOPPED' },
      });

      const actions = await tx.strategyAction.updateMany({
        where: {
          userId,
          status: 'PENDING',
          strategy: {
            environment: 'TESTNET',
            paperTrading: false,
          },
        },
        data: {
          status: 'FAILED',
          errorMessage: 'Cancelled by Testnet emergency stop',
          completedAt: stoppedAt,
        },
      });

      return {
        stoppedStrategies: strategies.count,
        cancelledPendingActions: actions.count,
      };
    });

    return {
      environment: 'TESTNET' as const,
      stoppedAt,
      ...result,
    };
  }
}
