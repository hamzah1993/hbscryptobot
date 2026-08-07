import { PrismaClient } from '@prisma/client';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run admin:promote -- user@example.com');
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.update({ where: { email }, data: { role: 'ADMIN', authVersion: { increment: 1 } }, select: { id: true, email: true, role: true } });
  console.log(`Promoted ${user.email} to ${user.role}. Existing sessions were invalidated.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
