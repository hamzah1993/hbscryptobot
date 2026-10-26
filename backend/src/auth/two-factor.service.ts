import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { CredentialCryptoService } from '../exchange/credentials/credential-crypto.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

type TotpUser = {
  id: string;
  totpSecretCipher: string | null;
  totpSecretIv: string | null;
  totpSecretTag: string | null;
  totpEnabledAt: Date | null;
  totpLastStep: number | null;
};

/** Authenticator-app two-factor login: setup, enable, disable and code checks. */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
    private readonly notifications: NotificationsService,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true } });
    return { enabled: Boolean(user.totpEnabledAt), enabledAt: user.totpEnabledAt };
  }

  /** Creates a new secret for the user to scan; it only takes effect after `enable` confirms a code. */
  async setup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpEnabledAt: true } });
    if (user.totpEnabledAt) throw new BadRequestException('Two-factor authentication is already enabled');
    const secret = generateTotpSecret();
    const encrypted = this.crypto.encrypt(secret);
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretCipher: encrypted.cipherText, totpSecretIv: encrypted.iv, totpSecretTag: encrypted.authTag, totpLastStep: null },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  async enable(userId: string, code: string) {
    const user = await this.load(userId);
    if (user.totpEnabledAt) throw new BadRequestException('Two-factor authentication is already enabled');
    if (!user.totpSecretCipher) throw new BadRequestException('Start two-factor setup first');
    await this.consume(user, code);
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } });
    this.notifications.publish({
      event: 'TWO_FACTOR_ENABLED', severity: 'INFO', userId,
      message: 'Two-factor authentication was turned on for your HBS Trading account.',
    });
    return { enabled: true };
  }

  async disable(userId: string, password: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabledAt) throw new BadRequestException('Two-factor authentication is not enabled');
    if (!(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Password is incorrect');
    await this.consume(user, code);
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretCipher: null, totpSecretIv: null, totpSecretTag: null, totpEnabledAt: null, totpLastStep: null },
    });
    this.notifications.publish({
      event: 'TWO_FACTOR_DISABLED', severity: 'WARNING', userId,
      message: 'Two-factor authentication was turned off for your HBS Trading account. If this was not you, change your password now.',
    });
    return { enabled: false };
  }

  /** Checks a login code for a user with two-factor enabled; each code works only once. */
  async verifyLogin(user: TotpUser, code: string) {
    await this.consume(user, code);
  }

  private load(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, totpSecretCipher: true, totpSecretIv: true, totpSecretTag: true, totpEnabledAt: true, totpLastStep: true },
    });
  }

  private async consume(user: TotpUser, code: string) {
    if (!user.totpSecretCipher || !user.totpSecretIv || !user.totpSecretTag) {
      throw new UnauthorizedException('Two-factor authentication is not set up');
    }
    const secret = this.crypto.decrypt(user.totpSecretCipher, user.totpSecretIv, user.totpSecretTag);
    const step = verifyTotp(secret, code);
    if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) {
      throw new UnauthorizedException('Invalid or already used authentication code');
    }
    // Conditional update: two concurrent logins with the same code cannot both succeed.
    const claimed = await this.prisma.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('Invalid or already used authentication code');
  }
}
