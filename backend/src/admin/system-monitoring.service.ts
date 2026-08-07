import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { NotificationSeverity } from '../notifications/notifications.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisLockService } from '../redis/redis-lock.service';
import { SystemHeartbeatService, type SystemHeartbeatName } from './system-heartbeat.service';

type CheckResult = {
  component: string;
  status: 'HEALTHY' | 'ERROR';
  severity: NotificationSeverity;
  message: string;
};

const HEARTBEAT_MAX_AGE_MS = 45_000;
const STARTUP_GRACE_MS = 60_000;
@Injectable()
export class SystemMonitoringService {
  private readonly logger = new Logger(SystemMonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisLockService,
    private readonly notifications: NotificationsService,
    private readonly heartbeat: SystemHeartbeatService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledCheck() {
    if ((process.env.SYSTEM_MONITORING_ENABLED ?? 'true').toLowerCase() !== 'true') return;
    try {
      await this.runCheck();
    } catch (error) {
      this.logger.error(`System monitoring check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async runCheck() {
    const checkedAt = new Date();
    const checks = await this.collectChecks(checkedAt);
    for (const check of checks) await this.reconcileIncident(check, checkedAt);
    return {
      status: checks.some((check) => check.status === 'ERROR') ? 'DEGRADED' as const : 'HEALTHY' as const,
      checkedAt: checkedAt.toISOString(),
      checks,
    };
  }

  async status() {
    const [incidents, latest] = await Promise.all([
      this.prisma.systemHealthIncident.findMany({ orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }], take: 50 }),
      this.prisma.systemHealthIncident.findFirst({ orderBy: { lastCheckedAt: 'desc' }, select: { lastCheckedAt: true } }),
    ]);
    return {
      enabled: (process.env.SYSTEM_MONITORING_ENABLED ?? 'true').toLowerCase() === 'true',
      intervalSeconds: 60,
      lastCheckedAt: latest?.lastCheckedAt.toISOString() ?? null,
      activeIncidents: incidents.filter((incident) => incident.active).length,
      incidents,
      heartbeats: this.heartbeat.snapshot(),
    };
  }

  private async collectChecks(now: Date): Promise<CheckResult[]> {
    const checks: CheckResult[] = [];
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push(this.result('DATABASE', 'HEALTHY', 'CRITICAL', 'PostgreSQL is reachable.'));
    } catch {
      checks.push(this.result('DATABASE', 'ERROR', 'CRITICAL', 'PostgreSQL health check failed.'));
      return checks;
    }

    try {
      await this.redis.ping();
      checks.push(this.result('REDIS', 'HEALTHY', 'CRITICAL', 'Redis is reachable.'));
    } catch {
      checks.push(this.result('REDIS', 'ERROR', 'CRITICAL', 'Redis health check failed. LIVE scheduler locking may be unavailable.'));
    }

    const snapshot = this.heartbeat.snapshot();
    const withinStartupGrace = now.getTime() - new Date(snapshot.startedAt).getTime() < STARTUP_GRACE_MS;
    const liveStrategyCount = await this.prisma.tradingStrategy.count({
      where: { status: 'RUNNING', mode: 'BINANCE_LIVE', exchange: 'BINANCE', environment: 'LIVE', paperTrading: false },
    });

    checks.push(this.heartbeatCheck('LIVE_STRATEGY_SCHEDULER', 'liveStrategyScheduler', snapshot.liveStrategyScheduler, now, withinStartupGrace, liveStrategyCount > 0));
    checks.push(this.heartbeatCheck('LIVE_ORDER_SYNC', 'liveOrderSync', snapshot.liveOrderSync, now, withinStartupGrace, true));
    checks.push(this.heartbeatCheck('LIVE_RETRY_SCHEDULER', 'liveRetryScheduler', snapshot.liveRetryScheduler, now, withinStartupGrace, liveStrategyCount > 0));

    const [failedActions, errorPositions] = await Promise.all([
      this.prisma.strategyAction.count({
        where: { status: 'PERMANENTLY_FAILED', strategy: { mode: 'BINANCE_LIVE', exchange: 'BINANCE', environment: 'LIVE', paperTrading: false } },
      }),
      this.prisma.tradingPosition.count({
        where: { status: 'ERROR', strategy: { mode: 'BINANCE_LIVE', exchange: 'BINANCE', environment: 'LIVE', paperTrading: false } },
      }),
    ]);
    checks.push(this.result('LIVE_FAILED_ACTIONS', failedActions ? 'ERROR' : 'HEALTHY', 'CRITICAL', failedActions ? `${failedActions} Binance LIVE action(s) require operator attention.` : 'No permanently failed Binance LIVE actions.'));
    checks.push(this.result('LIVE_ERROR_POSITIONS', errorPositions ? 'ERROR' : 'HEALTHY', 'CRITICAL', errorPositions ? `${errorPositions} Binance LIVE position(s) are in ERROR state.` : 'No Binance LIVE positions are in ERROR state.'));
    return checks;
  }

  private heartbeatCheck(component: string, name: SystemHeartbeatName, value: string | null, now: Date, startupGrace: boolean, required: boolean): CheckResult {
    if (!required) return this.result(component, 'HEALTHY', 'WARNING', `${name} is idle because no running Binance LIVE strategy requires it.`);
    if (startupGrace && !value) return this.result(component, 'HEALTHY', 'WARNING', `${name} is within startup grace period.`);
    const stale = !value || now.getTime() - new Date(value).getTime() > HEARTBEAT_MAX_AGE_MS;
    return this.result(component, stale ? 'ERROR' : 'HEALTHY', 'WARNING', stale ? `${name} heartbeat is delayed or missing.` : `${name} heartbeat is current.`);
  }

  private result(component: string, status: CheckResult['status'], severity: NotificationSeverity, message: string): CheckResult {
    return { component, status, severity, message };
  }

  private async reconcileIncident(check: CheckResult, checkedAt: Date) {
    const existing = await this.prisma.systemHealthIncident.findUnique({ where: { component: check.component } });
    if (check.status === 'ERROR') {
      const incident = await this.prisma.systemHealthIncident.upsert({
        where: { component: check.component },
        create: { component: check.component, active: true, severity: check.severity, message: check.message, consecutiveFailures: 1, openedAt: checkedAt, lastCheckedAt: checkedAt },
        update: existing?.active
          ? { severity: check.severity, message: check.message, consecutiveFailures: { increment: 1 }, lastCheckedAt: checkedAt }
          : { active: true, severity: check.severity, message: check.message, consecutiveFailures: 1, openedAt: checkedAt, resolvedAt: null, lastCheckedAt: checkedAt, lastAlertedAt: null },
      });
      if (!existing?.active) {
        await this.alertAdmin('SYSTEM_HEALTH_INCIDENT_OPENED', check.severity, `HBS production alert: ${check.message}`, check.component);
        await this.prisma.systemHealthIncident.update({ where: { id: incident.id }, data: { lastAlertedAt: checkedAt } });
      }
      return;
    }

    if (existing?.active) {
      await this.prisma.systemHealthIncident.update({ where: { id: existing.id }, data: { active: false, message: check.message, consecutiveFailures: 0, resolvedAt: checkedAt, lastCheckedAt: checkedAt } });
      // WARNING keeps recovery delivery visible with the default notification threshold.
      await this.alertAdmin('SYSTEM_HEALTH_INCIDENT_RESOLVED', 'WARNING', `HBS production recovered: ${check.component} is healthy again.`, check.component);
    } else if (existing) {
      await this.prisma.systemHealthIncident.update({ where: { id: existing.id }, data: { message: check.message, lastCheckedAt: checkedAt } });
    } else {
      await this.prisma.systemHealthIncident.create({ data: { component: check.component, active: false, severity: check.severity, message: check.message, consecutiveFailures: 0, openedAt: checkedAt, resolvedAt: checkedAt, lastCheckedAt: checkedAt } });
    }
  }

  private async alertAdmin(event: string, severity: NotificationSeverity, message: string, component: string) {
    const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const admin = configuredEmail
      ? await this.prisma.user.findUnique({ where: { email: configuredEmail }, select: { id: true } })
      : await this.prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!admin) {
      this.logger.warn(`${event}: no ADMIN account exists for notification delivery`);
      return;
    }
    this.notifications.publish({ event, severity, message, userId: admin.id, metadata: { component } });
  }
}
