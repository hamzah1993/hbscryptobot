import { ConflictException } from '@nestjs/common';
import { LIVE_CONFIRMATION_PHRASE, LiveTradingSafetyService } from './live-trading-safety.service';

describe('LiveTradingSafetyService', () => {
  it('invalidates confirmation whenever the LIVE capital ceiling changes', async () => {
    const prisma = {
      liveTradingSafetyProfile: {
        upsert: jest.fn().mockResolvedValue({ capitalCeilingQuote: 100, confirmedAt: null, confirmationVersion: null }),
      },
    } as any;
    const service = new LiveTradingSafetyService(prisma);
    await service.setCapitalCeiling('user-1', 100);
    expect(prisma.liveTradingSafetyProfile.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ confirmedAt: null, confirmationVersion: null }),
    }));
  });

  it('refuses explicit LIVE confirmation while prerequisite gates are closed', async () => {
    const service = new LiveTradingSafetyService({} as any);
    await expect(service.recordConfirmation('user-1', LIVE_CONFIRMATION_PHRASE, false)).rejects.toBeInstanceOf(ConflictException);
  });

  it('records a versioned acknowledgement only after gates allow confirmation', async () => {
    const prisma = {
      liveTradingSafetyProfile: {
        findUnique: jest.fn().mockResolvedValue({ capitalCeilingQuote: 50 }),
        update: jest.fn().mockResolvedValue({ capitalCeilingQuote: 50, confirmedAt: new Date('2026-08-07T12:00:00Z'), confirmationVersion: '2026-08-v1' }),
      },
    } as any;
    const service = new LiveTradingSafetyService(prisma);
    const result = await service.recordConfirmation('user-1', LIVE_CONFIRMATION_PHRASE, true);
    expect(result).toEqual(expect.objectContaining({ capitalCeilingQuote: 50, confirmationVersion: '2026-08-v1', activationEnabled: false }));
  });
});
