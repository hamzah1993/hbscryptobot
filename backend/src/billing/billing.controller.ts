import { Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../admin/admin.guard';
import { AdminSessionGuard } from '../admin/admin-session.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';
import { BalanceAdjustmentDto, UpdateBillingSettingsDto } from './dto/billing.dto';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  overview(@Req() request: AuthenticatedRequest) {
    return this.billing.overview(request.user.sub);
  }

  @Get('entries')
  entries(@Req() request: AuthenticatedRequest, @Query('limit') limit?: string) {
    return this.billing.listEntries(request.user.sub, Number(limit) || 100);
  }

  @Post('membership/activate')
  activateMembership(@Req() request: AuthenticatedRequest) {
    return this.billing.activateMembership(request.user.sub);
  }

  @Get('referrals')
  referrals(@Req() request: AuthenticatedRequest) {
    return this.billing.referralSummary(request.user.sub);
  }
}

@Controller('super/admin/control/billing')
@UseGuards(JwtAuthGuard, AdminGuard, AdminSessionGuard)
export class AdminBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  overview() {
    return this.billing.adminOverview();
  }

  @Patch('settings')
  updateSettings(@Req() request: AuthenticatedRequest, @Body() body: UpdateBillingSettingsDto) {
    return this.billing.updateSettings(request.user.sub, body);
  }

  @Post('adjustments')
  adjust(@Req() request: AuthenticatedRequest, @Body() body: BalanceAdjustmentDto) {
    return this.billing.adminAdjust(request.user.sub, body.email, body.amountQuote, body.reason);
  }
}
