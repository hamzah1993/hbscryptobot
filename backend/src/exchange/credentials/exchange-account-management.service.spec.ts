import { BadRequestException } from '@nestjs/common';
import { ExchangeEnvironment } from '@prisma/client';
import { ExchangeAccountManagementService } from './exchange-account-management.service';

describe('ExchangeAccountManagementService', () => {
  const credentials = {
    getBinance: jest.fn(),
  };
  const binance = {
    getAccount: jest.fn(),
  };

  const service = new ExchangeAccountManagementService(
    credentials as any,
    binance as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tests a Binance Testnet connection without exposing credentials', async () => {
    credentials.getBinance.mockResolvedValue({
      apiKey: 'secret-key',
      apiSecret: 'secret-value',
    });
    binance.getAccount.mockResolvedValue({
      canTrade: true,
      accountType: 'SPOT',
    });

    await expect(service.testBinanceTestnetConnection('user-1')).resolves.toEqual({
      connected: true,
      exchange: 'BINANCE',
      environment: 'TESTNET',
      canTrade: true,
      accountType: 'SPOT',
    });

    expect(credentials.getBinance).toHaveBeenCalledWith(
      'user-1',
      ExchangeEnvironment.TESTNET,
    );
    expect(binance.getAccount).toHaveBeenCalledWith(
      'secret-key',
      'secret-value',
      'testnet',
    );
  });

  it('returns only non-zero Testnet balances', async () => {
    credentials.getBinance.mockResolvedValue({
      apiKey: 'secret-key',
      apiSecret: 'secret-value',
    });
    binance.getAccount.mockResolvedValue({
      canTrade: false,
      balances: [
        { asset: 'BTC', free: '0.25', locked: '0' },
        { asset: 'ETH', free: '0', locked: '1.5' },
        { asset: 'USDT', free: '0', locked: '0' },
      ],
    });

    await expect(service.getBinanceTestnetBalances('user-1')).resolves.toEqual({
      exchange: 'BINANCE',
      environment: 'TESTNET',
      canTrade: false,
      balances: [
        { asset: 'BTC', free: 0.25, locked: 0 },
        { asset: 'ETH', free: 0, locked: 1.5 },
      ],
    });
  });

  it('rejects live account-management operations', () => {
    expect(() => service.assertTestnetOnly(ExchangeEnvironment.LIVE)).toThrow(
      BadRequestException,
    );
    expect(() => service.assertTestnetOnly(ExchangeEnvironment.TESTNET)).not.toThrow();
    expect(() => service.assertTestnetOnly()).not.toThrow();
  });
});
