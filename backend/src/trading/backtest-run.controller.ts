import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BacktestCandleRunnerService } from './backtest-candle-runner.service';
import {
  BacktestRunService,
  type CreateBacktestRunInput,
} from './backtest-run.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string };
}

type CreateBacktestRunBody = Omit<
  CreateBacktestRunInput,
  'startTime' | 'endTime'
> & {
  startTime: string;
  endTime: string;
};

@Controller('backtests')
@UseGuards(JwtAuthGuard)
export class BacktestRunController {
  constructor(
    private readonly runs: BacktestRunService,
    private readonly runner: BacktestCandleRunnerService,
  ) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateBacktestRunBody,
  ) {
    return this.runs.create(request.user.sub, {
      ...body,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
    });
  }

  @Post(':runId/start')
  start(
    @Req() request: AuthenticatedRequest,
    @Param('runId') runId: string,
  ) {
    return this.runner.run(request.user.sub, runId);
  }

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit === undefined ? undefined : Number(limit);
    if (parsedLimit !== undefined && Number.isNaN(parsedLimit)) {
      throw new BadRequestException('Backtest run limit must be a number');
    }

    return this.runs.list(request.user.sub, parsedLimit);
  }

  @Get(':runId/report')
  report(
    @Req() request: AuthenticatedRequest,
    @Param('runId') runId: string,
  ) {
    return this.runs.report(request.user.sub, runId);
  }

  @Get(':runId')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('runId') runId: string,
  ) {
    return this.runs.get(request.user.sub, runId);
  }
}
