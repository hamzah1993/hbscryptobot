import { Module } from '@nestjs/common';
import { BinanceModule } from '../exchange/binance/binance.module';
import { BinanceWebsocketMarketDataService } from './binance-websocket-market-data.service';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [BinanceModule],
  controllers: [MarketDataController],
  providers: [MarketDataService, BinanceWebsocketMarketDataService],
  exports: [MarketDataService, BinanceWebsocketMarketDataService],
})
export class MarketDataModule {}
