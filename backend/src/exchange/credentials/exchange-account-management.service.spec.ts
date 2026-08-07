import { BadRequestException } from '@nestjs/common';
import { ExchangeEnvironment } from '@prisma/client';
import { ExchangeAccountManagementService } from './exchange-account-management.service';

describe('ExchangeAccountManagementService', () => {
  const credentials = {
    getBinance: jest.fn(),
  };
  const binance = {
    getAccount: jest.fn(),
    getApiKeyPermissions: jest.fn(),
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

  it('accepts a Binance LIVE Spot trading key only when withdrawals are disabled', async () => {
    binance.getAccount.mockResolvedValue({
      canTrade: true,
      canWithdraw: false,
      accountType: 'SPOT',
      permissions: ['SPOT'],
    });
    binance.getApiKeyPermissions.mockResolvedValue({ enableSpotAndMarginTrading: true, enableWithdrawals: false });

    await expect(service.validateBinanceLiveCredentials('live-key', 'live-secret')).resolves.toEqual(
      expect.objectContaining({ connected: true, environment: 'LIVE', canTrade: true, canWithdraw: false, spotEnabled: true }),
    );
    expect(binance.getAccount).toHaveBeenCalledWith('live-key', 'live-secret', 'live');
  });

  it('rejects Binance LIVE credentials with withdrawal permission', async () => {
    binance.getAccount.mockResolvedValue({ canTrade: true, canWithdraw: true, accountType: 'SPOT' });
    binance.getApiKeyPermissions.mockResolvedValue({ enableSpotAndMarginTrading: true, enableWithdrawals: true });
    await expect(service.validateBinanceLiveCredentials('live-key', 'live-secret')).rejects.toThrow(
      'must not have withdrawal permission',
    );
  });

  it('rejects Binance LIVE credentials without Spot trading permission', async () => {
    binance.getAccount.mockResolvedValue({ canTrade: true, canWithdraw: true, accountType: 'SPOT' });
    binance.getApiKeyPermissions.mockResolvedValue({ enableSpotAndMarginTrading: false, enableWithdrawals: false });
    await expect(service.validateBinanceLiveCredentials('live-key', 'live-secret')).rejects.toThrow(
      'must have Spot trading permission',
    );
  });

  it('rejects live account-management operations', () => {
    expect(() => service.assertTestnetOnly(ExchangeEnvironment.LIVE)).toThrow(
      BadRequestException,
    );
    expect(() => service.assertTestnetOnly(ExchangeEnvironment.TESTNET)).not.toThrow();
    expect(() => service.assertTestnetOnly()).not.toThrow();
  });
});
