import { Injectable } from '@nestjs/common';
import { ExchangeEnvironment } from '@prisma/client';
import { ExchangeCredentialsService } from '../credentials/exchange-credentials.service';
import { BinanceService } from './binance.service';
import { BinanceTestnetOrderService } from './binance-testnet-order.service';

/**
 * Binance Spot LIVE order adapter.
 *
 * Authorization to use this adapter is deliberately enforced by the trading
 * layer immediately before submission. This class only owns exchange-specific
 * normalization, credentials and signed API transport.
 */
@Injectable()
export class BinanceLiveOrderService extends BinanceTestnetOrderService {
  protected override readonly credentialEnvironment = ExchangeEnvironment.LIVE;
  protected override readonly binanceEnvironment = 'live' as const;

  constructor(binance: BinanceService, credentials: ExchangeCredentialsService) {
    super(binance, credentials);
  }
}
