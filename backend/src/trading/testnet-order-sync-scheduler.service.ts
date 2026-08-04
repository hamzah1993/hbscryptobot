import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

@Injectable()
export class TestnetOrderSyncSchedulerService {
  private readonly logger = new Logger(TestnetOrderSyncSchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly testnetExecution: TestnetStrategyExecutionService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncOpenTestnetOrders() {
    if (this.running) return;

    this.running = true;
    try {
      const orders = await this.prisma.tradingOrder.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIALLY_FILLED'] },
          exchangeOrderId: { not: null },
          position: {
            strategy: {
              paperTrading: false,
              environment: 'TESTNET',
            },
          },
        },
        select: { id: true, userId: true },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      let synced = 0;
      for (const order of orders) {
        try {
          await this.testnetExecution.syncOrder(order.userId, order.id);
          synced += 1;
        } catch (error) {
          this.logger.warn(
            `Unable to synchronize testnet order ${order.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      if (synced > 0) {
        this.logger.log(`Synchronized ${synced} Binance testnet order(s)`);
      }
    } catch (error) {
      this.logger.error(
        'Scheduled Binance testnet order synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
