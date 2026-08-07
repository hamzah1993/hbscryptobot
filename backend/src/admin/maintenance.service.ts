import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  async isActive() {
    const state = await this.prisma.systemMaintenanceState.findUnique({ where: { id: 1 }, select: { active: true } });
    return state?.active ?? false;
  }

  status() {
    return this.prisma.systemMaintenanceState.findUnique({ where: { id: 1 } });
  }

  async enable(adminId: string, reason: string) {
    await this.prisma.tradingStrategy.updateMany({
      where: { paperTrading: false, status: { in: ['RUNNING', 'PAUSED'] } },
      data: { status: 'STOPPED' },
    });
    return this.prisma.systemMaintenanceState.upsert({
      where: { id: 1 },
      create: { id: 1, active: true, reason, startedBy: adminId, startedAt: new Date() },
      update: { active: true, reason, startedBy: adminId, startedAt: new Date() },
    });
  }

  disable() {
    return this.prisma.systemMaintenanceState.upsert({
      where: { id: 1 },
      create: { id: 1, active: false },
      update: { active: false, reason: null, startedBy: null, startedAt: null },
    });
  }
}
