import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard auth version', () => {
  const jwt = { verifyAsync: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };

  function context(token = 'token') {
    const request = { headers: { authorization: `Bearer ${token}` } } as any;
    return {
      request,
      context: { switchToHttp: () => ({ getRequest: () => request }) } as any,
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('accepts a token whose auth version matches the user', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', ver: 3 });
    prisma.user.findUnique.mockResolvedValue({ authVersion: 3 });
    const test = context();
    await expect(new JwtAuthGuard(jwt as any, prisma as any).canActivate(test.context)).resolves.toBe(true);
    expect(test.request.user).toEqual({ sub: 'u1', ver: 3 });
  });

  it('treats pre-migration tokens without a version as version zero', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
    prisma.user.findUnique.mockResolvedValue({ authVersion: 0 });
    await expect(new JwtAuthGuard(jwt as any, prisma as any).canActivate(context().context)).resolves.toBe(true);
  });

  it('rejects an old session after password change or reset increments auth version', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', ver: 0 });
    prisma.user.findUnique.mockResolvedValue({ authVersion: 1 });
    await expect(new JwtAuthGuard(jwt as any, prisma as any).canActivate(context().context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
