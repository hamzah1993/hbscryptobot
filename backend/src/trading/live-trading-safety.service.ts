import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const LIVE_CONFIRMATION_PHRASE = 'I UNDERSTAND LIVE TRADING USES REAL MONEY';
export const LIVE_CONFIRMATION_VERSION = '2026-08-v1';

@Injectable()
export class LiveTradingSafetyService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.liveTradingSafetyProfile.findUnique({ where: { userId } });
    return this.toResponse(profile);
  }

  async setCapitalCeiling(userId: string, capitalCeilingQuote: number) {
    if (!Number.isFinite(capitalCeilingQuote) || capitalCeilingQuote <= 0) {
      throw new BadRequestException('LIVE capital ceiling must be greater than zero');
    }

    const profile = await this.prisma.liveTradingSafetyProfile.upsert({
      where: { userId },
      create: { userId, capitalCeilingQuote, confirmedAt: null, confirmationVersion: null },
      update: {
        capitalCeilingQuote,
        // Any risk-ceiling change invalidates a previous acknowledgement.
        confirmedAt: null,
        confirmationVersion: null,
      },
    });
    return this.toResponse(profile);
  }

  async recordConfirmation(userId: string, phrase: string, allowed: boolean) {
    if (!allowed) {
      throw new ConflictException('LIVE confirmation is locked until every production and exchange E2E gate passes');
    }
    if (phrase.trim() !== LIVE_CONFIRMATION_PHRASE) {
      throw new BadRequestException(`Type exactly: ${LIVE_CONFIRMATION_PHRASE}`);
    }

    const existing = await this.prisma.liveTradingSafetyProfile.findUnique({ where: { userId } });
    if (!existing?.capitalCeilingQuote || Number(existing.capitalCeilingQuote) <= 0) {
      throw new ConflictException('Configure a LIVE capital ceiling before confirming activation');
    }

    const profile = await this.prisma.liveTradingSafetyProfile.update({
      where: { userId },
      data: { confirmedAt: new Date(), confirmationVersion: LIVE_CONFIRMATION_VERSION },
    });
    return this.toResponse(profile);
  }

  private toResponse(profile: { capitalCeilingQuote: unknown; confirmedAt: Date | null; confirmationVersion: string | null } | null) {
    return {
      capitalCeilingQuote: profile?.capitalCeilingQuote == null ? null : Number(profile.capitalCeilingQuote),
      confirmationVersion: profile?.confirmationVersion ?? null,
      confirmedAt: profile?.confirmedAt?.toISOString() ?? null,
      confirmationPhrase: LIVE_CONFIRMATION_PHRASE,
      activationEnabled: false,
    };
  }
}
