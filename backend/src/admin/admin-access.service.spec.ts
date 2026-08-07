import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AdminAccessService } from './admin-access.service';

describe('AdminAccessService', () => {
  const originalPassword = process.env.ADMIN_PASSWORD;
  const jwt = { signAsync: jest.fn().mockResolvedValue('step-up-token') } as any;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = originalPassword;
  });

  it('issues a short-lived step-up token for the configured password', async () => {
    process.env.ADMIN_PASSWORD = 'correct-password-123';
    const result = await new AdminAccessService(jwt).login('admin-1', 'correct-password-123');
    expect(result).toEqual({ adminSessionToken: 'step-up-token', expiresInSeconds: 900 });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'admin-1', purpose: 'admin-step-up' },
      { expiresIn: '15m' },
    );
  });

  it('rejects an incorrect administrator password', async () => {
    process.env.ADMIN_PASSWORD = 'correct-password-123';
    await expect(new AdminAccessService(jwt).login('admin-1', 'wrong-password-1234')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('fails closed when the administrator password is not configured', async () => {
    delete process.env.ADMIN_PASSWORD;
    await expect(new AdminAccessService(jwt).login('admin-1', 'any-password-1234')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
