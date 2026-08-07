import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BinanceTestnetOrderService } from '../exchange/binance/binance-testnet-order.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationChannelsService, type NotificationChannelSettingsInput } from '../notifications/notification-channels.service';
import { LiveTradingSafetyService } from './live-trading-safety.service';
import { LiveEmergencyExitService } from './live-emergency-exit.service';
import { PaperStrategyRunnerService } from './paper-strategy-runner.service';
import { ProductionReadinessService } from './production-readiness.service';
import { StrategyService, type StrategyInput } from './strategy.service';
import { TestnetActionTimelineService } from './testnet-action-timeline.service';
import { TestnetEmergencyStopService } from './testnet-emergency-stop.service';
import { TestnetRunnerHealthService } from './testnet-runner-health.service';
import { TestnetStrategyActionService } from './testnet-strategy-action.service';
import { TestnetStrategyExecutionService } from './testnet-strategy-execution.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string };
}

@Controller('strategies')
@UseGuards(JwtAuthGuard)
export class StrategyController {
  constructor(
    private readonly strategies: StrategyService,
    private readonly runner: PaperStrategyRunnerService,
    private readonly testnetExecution: TestnetStrategyExecutionService,
    private readonly testnetOrders: BinanceTestnetOrderService,
    private readonly testnetTimeline: TestnetActionTimelineService,
    private readonly testnetActions: TestnetStrategyActionService,
    private readonly testnetEmergencyStop: TestnetEmergencyStopService,
    private readonly testnetHealth: TestnetRunnerHealthService,
    private readonly notifications: NotificationsService,
    private readonly notificationChannels: NotificationChannelsService,
    private readonly productionReadiness: ProductionReadinessService,
    private readonly liveTradingSafety: LiveTradingSafetyService,
    private readonly liveEmergencyExit: LiveEmergencyExitService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.strategies.list(request.user.sub);
  }

  @Get('notifications')
  listNotifications(@Req() request: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.notifications.listRecent(request.user.sub, Number(limit ?? 100));
  }

  @Get('notifications/webhook-metrics')
  getNotificationWebhookMetrics() {
    return this.notifications.getWebhookMetrics();
  }

  @Get('notifications/channels')
  getNotificationChannels(@Req() request: AuthenticatedRequest) {
    return this.notificationChannels.getSettings(request.user.sub);
  }

  @Patch('notifications/channels')
  updateNotificationChannels(@Req() request: AuthenticatedRequest, @Body() body: NotificationChannelSettingsInput) {
    return this.notificationChannels.updateSettings(request.user.sub, body);
  }

  @Post('notifications/channels/:channel/test')
  testNotificationChannel(@Req() request: AuthenticatedRequest, @Param('channel') channel: string) {
    const normalized = channel.trim().toUpperCase();
    if (normalized !== 'EMAIL' && normalized !== 'TELEGRAM') {
      throw new BadRequestException('Unsupported notification channel');
    }
    return this.notificationChannels.sendTest(request.user.sub, normalized);
  }

  @Get('testnet-runner-health')
  getTestnetRunnerHealth() {
    return this.testnetHealth.snapshot();
  }

  @Get('production-readiness')
  getProductionReadiness(@Req() request: AuthenticatedRequest) {
    return this.productionReadiness.snapshot(request.user.sub);
  }

  @Get('live-safety')
  getLiveSafety(@Req() request: AuthenticatedRequest) {
    return this.liveTradingSafety.getProfile(request.user.sub);
  }

  @Patch('live-safety')
  setLiveSafety(
    @Req() request: AuthenticatedRequest,
    @Body() body: { capitalCeilingQuote: number },
  ) {
    return this.liveTradingSafety.setCapitalCeiling(request.user.sub, Number(body.capitalCeilingQuote));
  }

  @Post('live-safety/confirm')
  async confirmLiveSafety(
    @Req() request: AuthenticatedRequest,
    @Body() body: { confirmation: string },
  ) {
    const readiness = await this.productionReadiness.snapshot(request.user.sub);
    return this.liveTradingSafety.recordConfirmation(
      request.user.sub,
      body.confirmation ?? '',
      readiness.liveConfirmationAvailable,
    );
  }

  @Get('testnet-orders')
  listTestnetOrders(@Req() request: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.testnetExecution.listOrders(request.user.sub, Number(limit ?? 100));
  }

  @Get('testnet-positions')
  listTestnetPositions(@Req() request: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.testnetExecution.listPositions(request.user.sub, Number(limit ?? 100));
  }

  @Get('testnet-actions')
  listTestnetActions(@Req() request: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.testnetTimeline.list(request.user.sub, Number(limit ?? 100));
  }

  @Get('testnet-recovery')
  listTestnetRecovery(@Req() request: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.testnetActions.listUserRecoverable(request.user.sub, Number(limit ?? 100));
  }

  @Post('testnet-order-preview')
  previewTestnetOrder(@Req() request: AuthenticatedRequest, @Body() body: { symbol: string; quoteAmount: number }) {
    return this.testnetOrders.previewMarketBuy(request.user.sub, body.symbol, Number(body.quoteAmount));
  }

  @Post('testnet-positions/:positionId/close')
  closeTestnetPosition(
    @Req() request: AuthenticatedRequest,
    @Param('positionId') positionId: string,
    @Body() body: { subPositionId?: string },
  ) {
    return this.testnetExecution.closePosition(request.user.sub, positionId, body.subPositionId);
  }

  @Patch('testnet-positions/:positionId/take-profit')
  updateTestnetTakeProfit(
    @Req() request: AuthenticatedRequest,
    @Param('positionId') positionId: string,
    @Body() body: { target: 'PARENT' | 'RECOVERY' | 'INDEPENDENT'; takeProfitPrice: number; subPositionId?: string },
  ) {
    return this.testnetExecution.updateTakeProfit(request.user.sub, positionId, body);
  }

  @Post('testnet-actions/:actionId/retry')
  retryTestnetAction(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    return this.testnetActions.manualRetry(request.user.sub, actionId);
  }

  @Post('testnet-actions/:actionId/cancel-retry')
  cancelTestnetActionRetry(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    return this.testnetActions.cancelRetry(request.user.sub, actionId);
  }

  @Post('testnet-actions/:actionId/acknowledge')
  acknowledgeTestnetFailure(@Req() request: AuthenticatedRequest, @Param('actionId') actionId: string) {
    return this.testnetActions.acknowledgePermanentFailure(request.user.sub, actionId);
  }

  @Post('testnet-emergency-stop')
  stopTestnetStrategies(@Req() request: AuthenticatedRequest) {
    return this.testnetEmergencyStop.stopUserStrategies(request.user.sub);
  }

  @Post('testnet-emergency-exit')
  emergencyExit(@Req() request: AuthenticatedRequest) {
    return this.testnetEmergencyStop.exitUserPositions(request.user.sub);
  }

  @Post('live-emergency-exit')
  emergencyExitLive(@Req() request: AuthenticatedRequest) {
    return this.liveEmergencyExit.exitUserPositions(request.user.sub);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: StrategyInput) {
    return this.strategies.create(request.user.sub, body);
  }

  @Post('run-paper-tick')
  runPaperTick(@Req() request: AuthenticatedRequest) {
    return this.runner.runUserStrategies(request.user.sub);
  }

  @Post(':strategyId/testnet-order')
  executeTestnetOrder(
    @Req() request: AuthenticatedRequest,
    @Param('strategyId') strategyId: string,
    @Body() body: { side: 'BUY' | 'SELL'; quantity: number; type?: 'MARKET' | 'LIMIT'; price?: number },
  ) {
    return this.testnetExecution.executeMarketOrder(request.user.sub, {
      strategyId,
      side: body.side,
      quantity: body.quantity,
      orderType: body.type ?? 'MARKET',
      limitPrice: body.type === 'LIMIT' ? Number(body.price) : null,
      triggerPrice: body.price ? Number(body.price) : null,
      plannedQuoteAmount: body.side === 'BUY' && body.price ? body.quantity * Number(body.price) : null,
    });
  }

  @Post('testnet-orders/:tradingOrderId/sync')
  syncTestnetOrder(@Req() request: AuthenticatedRequest, @Param('tradingOrderId') tradingOrderId: string) {
    return this.testnetExecution.syncOrder(request.user.sub, tradingOrderId);
  }

  @Patch(':strategyId')
  update(@Req() request: AuthenticatedRequest, @Param('strategyId') strategyId: string, @Body() body: Partial<StrategyInput>) {
    return this.strategies.update(request.user.sub, strategyId, body);
  }

  @Post(':strategyId/status')
  setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('strategyId') strategyId: string,
    @Body() body: { status: 'RUNNING' | 'PAUSED' | 'STOPPED' },
  ) {
    return this.strategies.setStatus(request.user.sub, strategyId, body.status);
  }

  @Delete(':strategyId')
  remove(@Req() request: AuthenticatedRequest, @Param('strategyId') strategyId: string) {
    return this.strategies.remove(request.user.sub, strategyId);
  }
}
