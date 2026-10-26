import * as argon2 from 'argon2';
import { CredentialCryptoService } from '../exchange/credentials/credential-crypto.service';
import { base32Decode, totpCode, totpStep } from './totp';
import { TwoFactorService } from './two-factor.service';

describe('TwoFactorService', () => {
  const crypto = new CredentialCryptoService({ get: () => Buffer.alloc(32, 7).toString('base64') } as any);
  let user: Record<string, any>;
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn(async () => user),
      update: jest.fn(async ({ data }) => Object.assign(user, data)),
      updateMany: jest.fn(async ({ where, data }) => {
        const free = user.totpLastStep === null || user.totpLastStep < where.OR[1].totpLastStep.lt;
        if (!free) return { count: 0 };
        Object.assign(user, data);
        return { count: 1 };
      }),
    },
  };
  const notifications = { publish: jest.fn() };
  const service = new TwoFactorService(prisma as any, crypto, notifications as any);
  const currentCode = (secret: string) => totpCode(base32Decode(secret), totpStep());

  beforeEach(async () => {
    user = {
      id: 'u1', email: 'a@example.com', passwordHash: await argon2.hash('password123'),
      totpSecretCipher: null, totpSecretIv: null, totpSecretTag: null, totpEnabledAt: null, totpLastStep: null,
    };
  });

  it('enables two-factor only after a valid code and stores the secret encrypted', async () => {
    const { secret, otpauthUrl } = await service.setup('u1');
    expect(otpauthUrl).toContain(`secret=${secret}`);
    expect(user.totpSecretCipher).not.toContain(secret);
    await expect(service.enable('u1', '000000')).rejects.toThrow();
    expect(user.totpEnabledAt).toBeNull();

    await service.enable('u1', currentCode(secret));
    expect(user.totpEnabledAt).toBeInstanceOf(Date);
  });

  it('refuses to reuse a code', async () => {
    const { secret } = await service.setup('u1');
    const code = currentCode(secret);
    await service.enable('u1', code);
    await expect(service.verifyLogin(user as any, code)).rejects.toThrow('already used');
  });

  it('disables only with the password and a fresh code', async () => {
    const { secret } = await service.setup('u1');
    await service.enable('u1', currentCode(secret));
    user.totpLastStep -= 2; // pretend the enable happened a minute ago
    await expect(service.disable('u1', 'wrong-password', currentCode(secret))).rejects.toThrow('Password');
    await service.disable('u1', 'password123', currentCode(secret));
    expect(user).toMatchObject({ totpEnabledAt: null, totpSecretCipher: null });
  });
});
