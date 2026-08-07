import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  function context(userId = 'u1') {
    return { switchToHttp: () => ({ getRequest: () => ({ user: { sub: userId } }) }) } as any;
  }

  it('allows an ADMIN user', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN' }) } } as any;
    await expect(new AdminGuard(prisma).canActivate(context())).resolves.toBe(true);
  });

  it('rejects a normal user', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role: 'USER' }) } } as any;
    await expect(new AdminGuard(prisma).canActivate(context())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
