import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../admin/admin.guard';
import { AdminSessionGuard } from '../admin/admin-session.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTradingPackageDto, UpdateTradingPackageDto } from './dto/trading-package.dto';
import { PackagesService } from './packages.service';

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

  @Post('subscriptions/:subscriptionId/cancel')
  cancel(@Req() request: AuthenticatedRequest, @Param('subscriptionId') subscriptionId: string) {
    return this.packages.cancel(request.user.sub, subscriptionId);
  }
}

@Controller('super/admin/control/packages')
@UseGuards(JwtAuthGuard, AdminGuard, AdminSessionGuard)
export class AdminPackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  list() {
    return this.packages.adminList();
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateTradingPackageDto) {
    return this.packages.adminCreate(request.user.sub, body);
  }

  @Patch(':packageId')
  update(@Req() request: AuthenticatedRequest, @Param('packageId') packageId: string, @Body() body: UpdateTradingPackageDto) {
    return this.packages.adminUpdate(request.user.sub, packageId, body);
  }
}
