import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService account security', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    passwordResetToken: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    userKnownDevice: { findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
  const notifications = { publish: jest.fn() };
  const channels = { sendSecurityEmail: jest.fn().mockResolvedValue(true) };
  const service = () => new AuthService(prisma as any, jwt as any, notifications as any, channels as any);

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.signAsync.mockResolvedValue('signed-token');
    channels.sendSecurityEmail.mockResolvedValue(true);
  });

  it('records the first device without raising a new-device warning', async () => {
    const passwordHash = await argon2.hash('password123');
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@example.com', fullName: 'A', role: 'USER', authVersion: 0, passwordHash });
    prisma.userKnownDevice.findUnique.mockResolvedValue(null);
    prisma.userKnownDevice.count.mockResolvedValue(0);
    prisma.userKnownDevice.create.mockResolvedValue({ id: 'd1' });

    await service().login({ email: 'a@example.com', password: 'password123', deviceId: '7be110d5-2ca1-4aa9-a16e-e993aea08342' });

    expect(prisma.userKnownDevice.create).toHaveBeenCalledTimes(1);
    expect(notifications.publish).not.toHaveBeenCalled();
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', ver: 0 }));
  });

  it('publishes a warning when a valid login comes from a previously unseen device', async () => {
    const passwordHash = await argon2.hash('password123');
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@example.com', fullName: 'A', role: 'USER', authVersion: 2, passwordHash });
    prisma.userKnownDevice.findUnique.mockResolvedValue(null);
    prisma.userKnownDevice.count.mockResolvedValue(1);
    prisma.userKnownDevice.create.mockResolvedValue({ id: 'd2' });

    await service().login(
      { email: 'a@example.com', password: 'password123', deviceId: 'ad30d7ac-e38c-42fb-a77b-560fe65051f8' },
      { ipAddress: '203.0.113.8', userAgent: 'Example Browser' },
    );

    expect(notifications.publish).toHaveBeenCalledWith(expect.objectContaining({ event: 'NEW_DEVICE_LOGIN', severity: 'WARNING', userId: 'u1' }));
  });

  it('returns the same forgot-password response for an unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service().requestPasswordReset('missing@example.com')).resolves.toEqual({ requested: true });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(channels.sendSecurityEmail).not.toHaveBeenCalled();
  });

  it('stores only a hashed reset token and emails the one-time raw reset link', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@example.com' });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    prisma.passwordResetToken.create.mockResolvedValue({ id: 'r1' });

    await service().requestPasswordReset('A@example.com');

    const stored = prisma.passwordResetToken.create.mock.calls[0][0].data;
    const emailMessage = channels.sendSecurityEmail.mock.calls[0][2] as string;
    const rawToken = new URL(emailMessage.match(/https?:\/\/\S+/)![0]).searchParams.get('resetToken')!;
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('consumes a reset token and increments the auth version to invalidate old sessions', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'r1', userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { id: 'u1' },
    });
    prisma.$transaction.mockImplementation(async (callback: (tx: any) => Promise<void>) => callback({
      passwordResetToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: prisma.user,
    }));
    prisma.user.update.mockResolvedValue({ id: 'u1' });

    await expect(service().resetPassword({ token: 'x'.repeat(64), newPassword: 'newpassword123' })).resolves.toEqual({ reset: true, sessionsInvalidated: true });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ authVersion: { increment: 1 } }) }));
    expect(notifications.publish).toHaveBeenCalledWith(expect.objectContaining({ event: 'PASSWORD_RESET_COMPLETED' }));
  });

  it('rejects an expired password reset token', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({ id: 'r1', usedAt: null, expiresAt: new Date(Date.now() - 1), user: { id: 'u1' } });
    await expect(service().resetPassword({ token: 'x'.repeat(64), newPassword: 'newpassword123' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a wrong current password when changing password', async () => {
    const passwordHash = await argon2.hash('password123');
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash });
    await expect(service().changePassword('u1', { currentPassword: 'wrongpass', newPassword: 'newpassword123' })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
