import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';

export const ADMIN_SESSION_PURPOSE = 'admin-step-up';

@Injectable()
export class AdminAccessService {
  constructor(private readonly jwt: JwtService) {}

  async login(userId: string, password: string) {
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredPassword) throw new ServiceUnavailableException('Administrator password is not configured');

    const suppliedHash = createHash('sha256').update(password).digest();
    const configuredHash = createHash('sha256').update(configuredPassword).digest();
    if (!timingSafeEqual(suppliedHash, configuredHash)) {
      throw new UnauthorizedException('Invalid administrator password');
    }

    return {
      adminSessionToken: await this.jwt.signAsync(
        { sub: userId, purpose: ADMIN_SESSION_PURPOSE },
        { expiresIn: '15m' },
      ),
      expiresInSeconds: 15 * 60,
    };
  }
}
