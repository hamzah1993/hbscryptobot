import { Module } from '@nestjs/common';
import { ExchangeCredentialsModule } from '../credentials/exchange-credentials.module';
import { BinanceController } from './binance.controller';
import { BinanceService } from './binance.service';
import { BinanceLiveOrderService } from './binance-live-order.service';
import { BinanceTestnetOrderService } from './binance-testnet-order.service';

@Module({
  imports: [ExchangeCredentialsModule],
  controllers: [BinanceController],
  providers: [BinanceService, BinanceTestnetOrderService, BinanceLiveOrderService],
  exports: [BinanceService, BinanceTestnetOrderService, BinanceLiveOrderService],
})
export class BinanceModule {}
