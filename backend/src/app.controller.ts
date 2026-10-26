import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'hbs-trading-backend',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Shows the address rate limits are applied to. When TRUST_PROXY_HOPS is
   * right for the hosting provider, `ip` is your own public IP address.
   */
  @Get('health/client-ip')
  @UseGuards(JwtAuthGuard)
  clientIp(@Req() request: Request) {
    return { ip: request.ip, forwardedFor: request.headers['x-forwarded-for'] ?? null };
  }
}
