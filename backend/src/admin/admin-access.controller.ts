import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAccessService } from './admin-access.service';
import { AdminGuard } from './admin.guard';
import { AdminLoginDto } from './dto/admin-login.dto';

@Controller('super/admin/control')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAccessController {
  constructor(private readonly access: AdminAccessService) {}

  @Post('session')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Req() request: Request & { user: { sub: string } }, @Body() body: AdminLoginDto) {
    return this.access.login(request.user.sub, body.password);
  }
}
