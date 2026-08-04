import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { PaperStrategyRunnerService } from './paper-strategy-runner.service';
import { StrategyService, type StrategyInput } from './strategy.service';
import { TestnetActionTimelineService } from './testnet-action-timeline.service';
import { TestnetEmergencyStopService } from './testnet-emergency-stop.service';
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
    private readonly testnetTimeline: TestnetActionTimelineService,
    private readonly testnetEmergencyStop: TestnetEmergencyStopService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.strategies.list(request.user.sub);
  }

  @Get('notifications')
  listNotifications(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.listRecent(request.user.sub, Number(limit ?? 100));
  }

  @Get('testnet-orders')
  listTestnetOrders(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.testnetExecution.listOrders(request.user.sub, Number(limit ?? 100));
  }

  @Get('testnet-positions')
  listTestnetPositions(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.testnetExecution.listPositions(request.user.sub, Number(limit ?? 100));
  }

  @Get('testnet-actions')
  listTestnetActions(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    return this.testnetTimeline.list(request.user.sub, Number(limit ?? 100));
  }

  @Post('testnet-emergency-stop')
  stopTestnetStrategies(@Req() request: AuthenticatedRequest) {
    return this.testnetEmergencyStop.stopUserStrategies(request.user.sub);
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
    @Body() body: { side: 'BUY' | 'SELL'; quantity: number },
  ) {
    return this.testnetExecution.executeMarketOrder(request.user.sub, {
      strategyId,
      side: body.side,
      quantity: body.quantity,
    });
  }

  @Post('testnet-orders/:tradingOrderId/sync')
  syncTestnetOrder(
    @Req() request: AuthenticatedRequest,
    @Param('tradingOrderId') tradingOrderId: string,
  ) {
    return this.testnetExecution.syncOrder(request.user.sub, tradingOrderId);
  }

  @Patch(':strategyId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('strategyId') strategyId: string,
    @Body() body: Partial<StrategyInput>,
  ) {
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
