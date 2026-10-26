import { PrismaClient } from '@prisma/client';

// For a user who lost their authenticator: verify their identity out of band first.
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run user:reset-2fa -- user@example.com');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.update({
    where: { email },
    data: {
      totpSecretCipher: null, totpSecretIv: null, totpSecretTag: null, totpEnabledAt: null, totpLastStep: null,
      authVersion: { increment: 1 },
    },
    select: { email: true },
  });
  console.log(`Two-factor authentication was turned off for ${user.email}. Existing sessions were invalidated.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
