import { Module } from '@nestjs/common';
import { BybitV5DemoService } from '../bybit/bybit-v5-demo.service';
import { ExchangeCredentialsModule } from '../credentials/exchange-credentials.module';
import { OkxV5DemoService } from '../okx/okx-v5-demo.service';
import { DemoExchangeController } from './demo-exchange.controller';
import { DemoExchangeExecutionService } from './demo-exchange-execution.service';

@Module({
  imports: [ExchangeCredentialsModule],
  controllers: [DemoExchangeController],
  providers: [BybitV5DemoService, OkxV5DemoService, DemoExchangeExecutionService],
  exports: [BybitV5DemoService, OkxV5DemoService, DemoExchangeExecutionService],
})
export class DemoExchangeModule {}
