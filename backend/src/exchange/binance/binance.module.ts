import { Module } from '@nestjs/common';
import { ExchangeCredentialsModule } from '../credentials/exchange-credentials.module';
import { BinanceController } from './binance.controller';
import { BinanceService } from './binance.service';
import { BinanceTestnetOrderService } from './binance-testnet-order.service';

@Module({
  imports: [ExchangeCredentialsModule],
  controllers: [BinanceController],
  providers: [BinanceService, BinanceTestnetOrderService],
  exports: [BinanceService, BinanceTestnetOrderService],
})
export class BinanceModule {}
