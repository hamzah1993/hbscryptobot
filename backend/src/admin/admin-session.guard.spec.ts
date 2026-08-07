import { UnauthorizedException } from '@nestjs/common';
import { AdminSessionGuard } from './admin-session.guard';

function context(userId = 'admin-1', token: string | undefined = 'step-up-token') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: userId }, headers: token ? { 'x-admin-session': token } : {} }),
    }),
  } as any;
}

describe('AdminSessionGuard', () => {
  it('allows a matching administrator step-up session', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'admin-1', purpose: 'admin-step-up' }) } as any;
    await expect(new AdminSessionGuard(jwt).canActivate(context())).resolves.toBe(true);
  });

  it('rejects a token belonging to another administrator', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'admin-2', purpose: 'admin-step-up' }) } as any;
    await expect(new AdminSessionGuard(jwt).canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an ordinary JWT without the step-up purpose', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'admin-1' }) } as any;
    await expect(new AdminSessionGuard(jwt).canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
