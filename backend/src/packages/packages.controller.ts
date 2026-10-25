import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../admin/admin.guard';
import { AdminSessionGuard } from '../admin/admin-session.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreatePackageStrategyTemplateDto, CreateTradingPackageDto, StrategyBacktestDto, UpdatePackageStrategyTemplateDto, UpdateTradingPackageDto,
} from './dto/trading-package.dto';
import { STRATEGY_FIELDS } from './package-template';
import { PackagesService } from './packages.service';
import { StrategyBacktestService } from './strategy-backtest.service';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('packages')
@UseGuards(JwtAuthGuard)
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  list() {
    return this.packages.listAvailable();
  }

  @Get('subscriptions')
  listMine(@Req() request: AuthenticatedRequest) {
    return this.packages.listMine(request.user.sub);
  }

  @Post(':packageId/subscribe')
  subscribe(@Req() request: AuthenticatedRequest, @Param('packageId') packageId: string) {
    return this.packages.subscribe(request.user.sub, packageId);
  }

  @Post('subscriptions/:subscriptionId/start')
  start(@Req() request: AuthenticatedRequest, @Param('subscriptionId') subscriptionId: string) {
    return this.packages.setBotStatus(request.user.sub, subscriptionId, 'RUNNING');
  }

  @Post('subscriptions/:subscriptionId/stop')
  stop(@Req() request: AuthenticatedRequest, @Param('subscriptionId') subscriptionId: string) {
    return this.packages.setBotStatus(request.user.sub, subscriptionId, 'STOPPED');
  }

  @Post('subscriptions/:subscriptionId/cancel')
  cancel(@Req() request: AuthenticatedRequest, @Param('subscriptionId') subscriptionId: string) {
    return this.packages.cancel(request.user.sub, subscriptionId);
  }
}

@Controller('super/admin/control')
@UseGuards(JwtAuthGuard, AdminGuard, AdminSessionGuard)
export class AdminPackagesController {
  constructor(
    private readonly packages: PackagesService,
    private readonly backtests: StrategyBacktestService,
  ) {}

  @Get('package-strategies')
  listTemplates() {
    return this.packages.adminListTemplates();
  }

  /** Field definitions the admin form is rendered from. */
  @Get('package-strategies/fields')
  fields() {
    return STRATEGY_FIELDS;
  }

  /** Backtests saved or unsaved strategy settings on Binance history. */
  @Post('package-strategies/backtest')
  backtest(@Body() body: StrategyBacktestDto) {
    return this.backtests.run(body);
  }

  @Post('package-strategies')
  createTemplate(@Req() request: AuthenticatedRequest, @Body() body: CreatePackageStrategyTemplateDto) {
    return this.packages.adminCreateTemplate(request.user.sub, body);
  }

  @Patch('package-strategies/:templateId')
  updateTemplate(@Req() request: AuthenticatedRequest, @Param('templateId') templateId: string, @Body() body: UpdatePackageStrategyTemplateDto) {
    return this.packages.adminUpdateTemplate(request.user.sub, templateId, body);
  }

  @Get('packages')
  list() {
    return this.packages.adminList();
  }

  @Post('packages')
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateTradingPackageDto) {
    return this.packages.adminCreate(request.user.sub, body);
  }

  @Patch('packages/:packageId')
  update(@Req() request: AuthenticatedRequest, @Param('packageId') packageId: string, @Body() body: UpdateTradingPackageDto) {
    return this.packages.adminUpdate(request.user.sub, packageId, body);
  }
}
