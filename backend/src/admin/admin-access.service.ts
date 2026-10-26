import { ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const ADMIN_SESSION_PURPOSE = 'admin-step-up';

@Injectable()
export class AdminAccessService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(userId: string, password: string) {
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredPassword) throw new ServiceUnavailableException('Administrator password is not configured');
    // The admin area controls fees, balances and strategies, so it requires two-factor sign-in
    // (ADMIN_REQUIRE_2FA=false turns this off for local development only).
    if (process.env.ADMIN_REQUIRE_2FA !== 'false') {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } });
      if (!user?.totpEnabledAt) {
        throw new ForbiddenException('Turn on two-factor authentication in your profile before opening the admin area');
      }
    }

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
