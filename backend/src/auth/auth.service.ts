import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { NotificationChannelsService } from '../notifications/notification-channels.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

export type LoginMetadata = {
  userAgent?: string;
  ipAddress?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly notifications: NotificationsService,
    private readonly notificationChannels: NotificationChannelsService,
  ) {}

  async register(dto: RegisterDto, metadata: LoginMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email is already registered');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email, fullName: dto.fullName.trim(), passwordHash },
      select: { id: true, email: true, fullName: true, role: true, authVersion: true, createdAt: true },
    });
    if (dto.deviceId) await this.recordDevice(user.id, dto.deviceId, metadata, false);

    return { user: this.publicUser(user), accessToken: await this.signToken(user.id, user.email, user.role, user.authVersion) };
  }

  async login(dto: LoginDto, metadata: LoginMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (dto.deviceId) await this.recordDevice(user.id, dto.deviceId, metadata, true);

    return {
      user: this.publicUser(user),
      accessToken: await this.signToken(user.id, user.email, user.role, user.authVersion),
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await argon2.verify(user.passwordHash, dto.newPassword)) {
      throw new BadRequestException('New password must be different from the current password');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    this.notifications.publish({
      event: 'PASSWORD_CHANGED',
      message: 'Your HBS Trading password was changed. All existing sessions have been signed out.',
      severity: 'WARNING',
      userId,
    });
    return { changed: true, sessionsInvalidated: true };
  }

  async requestPasswordReset(emailInput: string): Promise<{ requested: true }> {
    const email = emailInput.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) return { requested: true };

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: this.hashResetToken(token), expiresAt },
    });

    const baseUrl = (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(/\/$/, '');
    const resetUrl = `${baseUrl}/auth?resetToken=${encodeURIComponent(token)}`;
    void this.notificationChannels.sendSecurityEmail(
      user.email,
      '[HBS Trading] Reset your password',
      `A password reset was requested for your HBS Trading account.\n\nReset password: ${resetUrl}\n\nThis link expires in 30 minutes and can only be used once. If you did not request this, you can ignore this email.`,
    );
    return { requested: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashResetToken(dto.token);
    const reset = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) throw new BadRequestException('Reset link is invalid or has expired');
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
    });

    this.notifications.publish({
      event: 'PASSWORD_RESET_COMPLETED',
      message: 'Your HBS Trading password was reset. All existing sessions have been signed out.',
      severity: 'WARNING',
      userId: reset.userId,
    });
    return { reset: true, sessionsInvalidated: true };
  }

  private async recordDevice(userId: string, deviceId: string, metadata: LoginMetadata, notifyNew: boolean) {
    const deviceHash = createHash('sha256').update(deviceId).digest('hex');
    const existing = await this.prisma.userKnownDevice.findUnique({
      where: { userId_deviceHash: { userId, deviceHash } },
    });
    const now = new Date();
    const userAgent = metadata.userAgent?.slice(0, 500) || null;
    const ipAddress = metadata.ipAddress?.slice(0, 64) || null;

    if (existing) {
      await this.prisma.userKnownDevice.update({
        where: { id: existing.id },
        data: { lastLoginAt: now, userAgent, ipAddress },
      });
      return;
    }

    const knownDeviceCount = await this.prisma.userKnownDevice.count({ where: { userId } });
    await this.prisma.userKnownDevice.create({
      data: { userId, deviceHash, userAgent, ipAddress, firstLoginAt: now, lastLoginAt: now },
    });
    if (!notifyNew || knownDeviceCount === 0) return;

    this.notifications.publish({
      event: 'NEW_DEVICE_LOGIN',
      message: 'A new device signed in to your HBS Trading account. If this was not you, change your password immediately.',
      severity: 'WARNING',
      userId,
      metadata: {
        ipAddress: ipAddress ?? 'Unavailable',
        userAgent: userAgent ?? 'Unavailable',
      },
    });
  }

  private publicUser(user: { id: string; email: string; fullName: string; role: string; createdAt?: Date }) {
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, ...(user.createdAt ? { createdAt: user.createdAt } : {}) };
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private signToken(sub: string, email: string, role: string, authVersion: number) {
    return this.jwt.signAsync({ sub, email, role, ver: authVersion });
  }
}
