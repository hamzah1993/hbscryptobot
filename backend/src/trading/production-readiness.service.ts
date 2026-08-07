import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelsService } from '../notifications/notification-channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { TestnetRunnerHealthService } from './testnet-runner-health.service';

@Injectable()
export class ProductionReadinessService {
  private readonly latencyTargetMs = 500;
  private readonly latencySampleLimit = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly health: TestnetRunnerHealthService,
    private readonly config: ConfigService,
    private readonly notificationChannels: NotificationChannelsService,
  ) {}

  async snapshot(userId: string) {
    const [orders, unresolvedActions, permanentFailures, credentialGroups, notifications, liveSafetyProfile] = await Promise.all([
      this.prisma.tradingOrder.findMany({
        where: { userId, executionLatencyMs: { not: null } },
        select: { executionLatencyMs: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: this.latencySampleLimit,
      }),
      this.prisma.strategyAction.count({
        where: { userId, status: { in: ['PENDING', 'SUBMITTED', 'FAILED'] } },
      }),
      this.prisma.strategyAction.count({
        where: { userId, status: 'PERMANENTLY_FAILED' },
      }),
      this.prisma.exchangeCredential.groupBy({
        by: ['exchange', 'environment'],
        where: { userId },
        _count: { _all: true },
      }),
      this.notificationChannels.getSettings(userId),
      this.prisma.liveTradingSafetyProfile.findUnique({ where: { userId } }),
    ]);

    const latencies = orders.map((order) => Number(order.executionLatencyMs)).filter(Number.isFinite).sort((a, b) => a - b);
    const sum = latencies.reduce((total, value) => total + value, 0);
    const p95Index = latencies.length ? Math.min(Math.ceil(latencies.length * 0.95) - 1, latencies.length - 1) : -1;
    const runner = this.health.snapshot();
    const schedulerHealthy = [runner.scheduler, runner.orderSync, runner.retryScheduler].every((status) => status === 'HEALTHY' || status === 'IDLE');
    const p95 = p95Index >= 0 ? latencies[p95Index] : null;
    const executionEvidence = {
      sampleCount: latencies.length,
      targetMs: this.latencyTargetMs,
      averageMs: latencies.length ? Number((sum / latencies.length).toFixed(1)) : null,
      p95Ms: p95,
      maxMs: latencies.length ? latencies[latencies.length - 1] : null,
      withinTargetCount: latencies.filter((value) => value < this.latencyTargetMs).length,
      overTargetCount: latencies.filter((value) => value >= this.latencyTargetMs).length,
      minimumSamples: 10,
      meetsTarget: latencies.length >= 10 && p95 !== null && p95 <= this.latencyTargetMs,
      retryPolicy: { initialAttempt: 1, retries: 3, totalAttempts: 4, backoff: 'exponential' },
    };
    const configured = (exchange: string, environment: string) => credentialGroups.some((group) => group.exchange === exchange && group.environment === environment && group._count._all > 0);
    const hardeningChecks = {
      executionLatencyEvidence: executionEvidence.meetsTarget,
      schedulersHealthy: schedulerHealthy,
      redisAvailable: runner.redis === 'AVAILABLE',
      noUnresolvedExchangeActions: unresolvedActions === 0,
      noPermanentActionFailures: permanentFailures === 0,
      operationalNotificationProvider: notifications.email.providerConfigured || notifications.telegram.providerConfigured,
      binanceTestnetCredential: configured('BINANCE', 'TESTNET'),
      bybitTestnetCredential: configured('BYBIT', 'TESTNET'),
      okxDemoCredential: configured('OKX', 'TESTNET'),
    };
    const productionHardeningReady = hardeningChecks.executionLatencyEvidence
      && hardeningChecks.schedulersHealthy
      && hardeningChecks.redisAvailable
      && hardeningChecks.noUnresolvedExchangeActions
      && hardeningChecks.noPermanentActionFailures;

    const liveFeatureFlag = this.config.get<string>('ENABLE_LIVE_TRADING') === 'true';
    // Binance is now the independent first LIVE rollout. Bybit/OKX remain
    // separately gated and do not block Binance activation.
    const binanceTestnetW2wCertified = true;
    const liveRoutingImplemented = true;
    // Operator evidence gate: code/tests alone do not prove that a production
    // emergency exit has successfully reached Binance LIVE. This remains false
    // until the controlled verification step is explicitly recorded in config.
    const liveEmergencyExitAdapterVerified = this.config.get<string>('BINANCE_LIVE_EMERGENCY_EXIT_VERIFIED') === 'true';
    const liveCapitalCeilingConfigured = liveSafetyProfile?.capitalCeilingQuote != null
      && Number(liveSafetyProfile.capitalCeilingQuote) > 0;
    const explicitLiveConfirmationRecorded = liveSafetyProfile?.confirmationVersion === '2026-08-v1'
      && liveSafetyProfile.confirmedAt !== null;
    const liveChecks = {
      productionHardeningReady,
      operationalNotificationProvider: hardeningChecks.operationalNotificationProvider,
      fixedRiskBudgetEnforced: true,
      perBotRiskCeilingsImplemented: true,
      dailyLossGateImplemented: true,
      emergencyExitWorkflowImplemented: true,
      emergencyReentryBlockImplemented: true,
      binanceTestnetW2wCertified,
      binanceStrategyRoutingVerified: true,
      bybitStrategyRoutingVerified: false,
      okxStrategyRoutingVerified: false,
      liveFeatureFlag,
      liveRoutingImplemented,
      binanceLiveCredentialsConfigured: configured('BINANCE', 'LIVE'),
      liveCredentialsConfigured: configured('BINANCE', 'LIVE'),
      liveCapitalCeilingConfigured,
      explicitLiveConfirmationImplemented: true,
      explicitLiveConfirmationRecorded,
      liveEmergencyExitAdapterVerified,
    };
    const liveConfirmationAvailable = liveChecks.productionHardeningReady
      && liveChecks.operationalNotificationProvider
      && liveChecks.fixedRiskBudgetEnforced
      && liveChecks.perBotRiskCeilingsImplemented
      && liveChecks.dailyLossGateImplemented
      && liveChecks.emergencyExitWorkflowImplemented
      && liveChecks.emergencyReentryBlockImplemented
      && liveChecks.binanceTestnetW2wCertified
      && liveChecks.binanceStrategyRoutingVerified
      && liveChecks.liveFeatureFlag
      && liveChecks.liveRoutingImplemented
      && liveChecks.liveCredentialsConfigured
      && liveChecks.liveCapitalCeilingConfigured
      && liveChecks.liveEmergencyExitAdapterVerified;

    return {
      executionEvidence,
      runner,
      unresolvedActions,
      permanentFailures,
      notificationReadiness: {
        email: notifications.email,
        telegram: notifications.telegram,
        atLeastOneProviderConfigured: hardeningChecks.operationalNotificationProvider,
      },
      hardeningChecks,
      productionHardeningReady,
      liveChecks,
      liveSafetyProfile: {
        capitalCeilingQuote: liveSafetyProfile?.capitalCeilingQuote == null ? null : Number(liveSafetyProfile.capitalCeilingQuote),
        confirmedAt: liveSafetyProfile?.confirmedAt?.toISOString() ?? null,
        confirmationVersion: liveSafetyProfile?.confirmationVersion ?? null,
      },
      liveConfirmationAvailable,
      liveMoneyReady: liveConfirmationAvailable && explicitLiveConfirmationRecorded,
    };
  }
}
