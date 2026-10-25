import { Module } from '@nestjs/common';
import { TradingEngineModule } from '../trading/trading-engine.module';
import { AdminPackagesController, PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';
import { StrategyBacktestService } from './strategy-backtest.service';

@Module({
  imports: [TradingEngineModule],
  controllers: [PackagesController, AdminPackagesController],
  providers: [PackagesService, StrategyBacktestService],
})
export class PackagesModule {}
