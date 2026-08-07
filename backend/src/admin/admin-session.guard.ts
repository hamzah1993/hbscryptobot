import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ADMIN_SESSION_PURPOSE } from './admin-access.service';

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const token = request.headers['x-admin-session'];
    if (typeof token !== 'string') throw new UnauthorizedException('Administrator login required');

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; purpose?: string }>(token);
      if (payload.purpose !== ADMIN_SESSION_PURPOSE || !request.user?.sub || payload.sub !== request.user.sub) {
        throw new UnauthorizedException('Administrator session is invalid');
      }
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Administrator session is invalid or expired');
    }
  }
}
