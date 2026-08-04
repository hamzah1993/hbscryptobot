import { Module } from '@nestjs/common';
import { ExchangeCredentialsModule } from '../credentials/exchange-credentials.module';
import { BinanceController } from './binance.controller';
import { BinanceService } from './binance.service';

@Module({
  imports: [ExchangeCredentialsModule],
  controllers: [BinanceController],
  providers: [BinanceService],
  exports: [BinanceService],
})
export class BinanceModule {}
