import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaperStrategyRunnerService } from './paper-strategy-runner.service';
import { StrategyService, type StrategyInput } from './strategy.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string };
}

@Controller('strategies')
@UseGuards(JwtAuthGuard)
export class StrategyController {
  constructor(
    private readonly strategies: StrategyService,
    private readonly runner: PaperStrategyRunnerService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.strategies.list(request.user.sub);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: StrategyInput) {
    return this.strategies.create(request.user.sub, body);
  }

  @Post('run-paper-tick')
  runPaperTick(@Req() request: AuthenticatedRequest) {
    return this.runner.runUserStrategies(request.user.sub);
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
