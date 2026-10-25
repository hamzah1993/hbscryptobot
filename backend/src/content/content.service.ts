import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

const RECENT_PROFIT_WINDOW_MS = 7 * 86_400_000;

/** App home content: admin announcements and a feed of real, anonymised profitable trades. */
@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  listPublished(limit = 50) {
    return this.prisma.announcement.findMany({
      where: { published: true },
      select: { id: true, title: true, body: true, pinned: true, publishedAt: true },
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  /**
   * Recently closed profitable Binance LIVE positions across the platform.
   * Only real trades are shown: no amounts, no user identity beyond a masked
   * initial, and the return is realized profit over the position's filled buys.
   */
  async recentProfits(limit = 20) {
    const positions = await this.prisma.tradingPosition.findMany({
      where: {
        status: 'CLOSED', realizedPnlQuote: { gt: 0 }, closedAt: { gte: new Date(Date.now() - RECENT_PROFIT_WINDOW_MS) },
        strategy: { exchange: 'BINANCE', environment: 'LIVE', paperTrading: false },
      },
      select: {
        id: true, symbol: true, realizedPnlQuote: true, closedAt: true,
        user: { select: { fullName: true } },
        orders: { where: { side: 'BUY' }, select: { accountedQuoteAmount: true } },
      },
      orderBy: { closedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
    return positions.flatMap((position) => {
      const cost = position.orders.reduce((sum, order) => sum + Number(order.accountedQuoteAmount), 0);
      if (!(cost > 0)) return [];
      return [{
        id: position.id,
        symbol: position.symbol,
        profitPercent: Math.round((Number(position.realizedPnlQuote) / cost) * 10_000) / 100,
        user: `${(position.user.fullName.trim()[0] ?? '*').toUpperCase()}****`,
        closedAt: position.closedAt,
      }];
    });
  }

  adminList() {
    return this.prisma.announcement.findMany({ orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] });
  }

  async adminCreate(adminId: string, dto: AnnouncementDto) {
    const created = await this.prisma.announcement.create({
      data: {
        title: dto.title.trim(), body: dto.body.trim(), pinned: dto.pinned ?? false,
        published: dto.published ?? false, publishedAt: dto.published ? new Date() : null,
      },
    });
    await this.audit(adminId, 'ANNOUNCEMENT_CREATED', created.id, { title: created.title, published: created.published });
    return created;
  }

  async adminUpdate(adminId: string, id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Announcement not found');
    const publishing = dto.published === true && !existing.published;
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title?.trim(), body: dto.body?.trim(), pinned: dto.pinned, published: dto.published,
        ...(publishing ? { publishedAt: new Date() } : {}),
      },
    });
    await this.audit(adminId, 'ANNOUNCEMENT_UPDATED', id, { changed: Object.keys(dto) });
    return updated;
  }

  async adminDelete(adminId: string, id: string) {
    const existing = await this.prisma.announcement.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!existing) throw new NotFoundException('Announcement not found');
    await this.prisma.announcement.delete({ where: { id } });
    await this.audit(adminId, 'ANNOUNCEMENT_DELETED', id, { title: existing.title });
    return { deleted: true };
  }

  private async audit(adminId: string, action: string, target: string, metadata: Record<string, unknown>) {
    await this.prisma.adminAuditEvent.create({ data: { adminId, action, target, metadata: metadata as Prisma.InputJsonValue } });
  }
}
