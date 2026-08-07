import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!configuredEmail) return;

    const user = await this.prisma.user.findUnique({ where: { email: configuredEmail }, select: { id: true, role: true } });
    if (!user) {
      this.logger.warn('ADMIN_EMAIL does not match an existing user; administrator was not promoted');
      return;
    }
    if (user.role === 'ADMIN') return;

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN', authVersion: { increment: 1 } } }),
      this.prisma.adminAuditEvent.create({ data: { adminId: user.id, action: 'ADMIN_PROMOTED_FROM_ENVIRONMENT' } }),
    ]);
    this.logger.log('Configured ADMIN_EMAIL account promoted to administrator; existing sessions invalidated');
  }
}
