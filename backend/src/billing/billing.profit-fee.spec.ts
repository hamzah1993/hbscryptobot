import { BillingService } from './billing.service';

describe('BillingService profit fee', () => {
  function setup(position: { realizedPnlQuote: number; subPositions: Array<{ realizedPnlQuote: number }> }) {
    const entries: any[] = [];
    const tx = {
      billingSettings: {
        upsert: jest.fn().mockResolvedValue({
          membershipFeeQuote: 0, membershipDays: 365, profitFeePercent: 20, minBalanceQuote: 0,
          referralPercents: [], profitFeeStartAt: new Date(0),
        }),
      },
      tradingPosition: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'position-1', userId: 'user-1', symbol: 'BTCUSDT', ...position }),
      },
      billingAccount: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', referrerId: null }),
        update: jest.fn().mockResolvedValue({ balanceQuote: 0 }),
      },
      balanceEntry: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => { entries.push(data); return { id: 'entry-1', ...data }; }),
      },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } as any;
    return { service: new BillingService(prisma, { enabled: false } as any), entries };
  }

  it('charges the fee on the main basket and independent levels together', async () => {
    const { service, entries } = setup({ realizedPnlQuote: 3, subPositions: [{ realizedPnlQuote: 1.5 }, { realizedPnlQuote: 0.5 }] });

    await expect(service.settleProfitFee('position-1')).resolves.toEqual({ positionId: 'position-1', feeQuote: 1 });
    expect(entries[0]).toMatchObject({ type: 'PROFIT_FEE', amountQuote: -1, referenceId: 'position-1' });
  });

  it('charges nothing when the cycle lost money overall', async () => {
    const { service, entries } = setup({ realizedPnlQuote: 2, subPositions: [{ realizedPnlQuote: -3 }] });

    await expect(service.settleProfitFee('position-1')).resolves.toEqual({ positionId: 'position-1', feeQuote: 0 });
    expect(entries).toHaveLength(0);
  });
});
