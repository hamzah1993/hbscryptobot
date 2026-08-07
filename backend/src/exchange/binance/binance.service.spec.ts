import { BadRequestException } from '@nestjs/common';
import { BinanceService } from './binance.service';

describe('BinanceService LIVE signed requests', () => {
  const service = new BinanceService({} as any);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('surfaces Binance credential errors as a client error instead of HTTP 500', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: -2015, msg: 'Invalid API-key, IP, or permissions for action.' }),
    } as Response);

    await expect(service.getAccount('bad-key', 'bad-secret', 'live')).rejects.toThrow(BadRequestException);
    await expect(service.getAccount('bad-key', 'bad-secret', 'live')).rejects.toThrow('Binance: Invalid API-key, IP, or permissions for action.');
  });

  it('queries the LIVE API-key permission endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ enableSpotAndMarginTrading: true, enableWithdrawals: false }),
    } as Response);

    await expect(service.getApiKeyPermissions('live-key', 'live-secret')).resolves.toMatchObject({
      enableSpotAndMarginTrading: true,
      enableWithdrawals: false,
    });
    expect(fetchMock.mock.calls[0][0]).toContain('https://api.binance.com/sapi/v1/account/apiRestrictions?');
  });
});
