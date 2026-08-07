import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

@Injectable()
export class AdminBackupScheduler {
  private readonly logger = new Logger(AdminBackupScheduler.name);
  constructor(private readonly prisma: PrismaService, private readonly admin: AdminService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async createDailyBackup() {
    if ((process.env.AUTO_BACKUPS_ENABLED ?? 'false').toLowerCase() !== 'true') return;
    const operator = await this.prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    if (!operator) {
      this.logger.warn('Automated backup skipped because no ADMIN user exists');
      return;
    }
    try { await this.admin.createBackup(operator.id, 'SCHEDULED'); }
    catch (error) { this.logger.error(`Automated backup failed: ${error instanceof Error ? error.message : String(error)}`); }
  }
}
