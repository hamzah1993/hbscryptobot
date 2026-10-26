import { Module } from '@nestjs/common';
import { AdminBillingController, BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BscDepositScanner } from './bsc-deposit.scanner';
import { DepositAddressService } from './deposit-address.service';
import { ProfitFeeScheduler } from './profit-fee.scheduler';

@Module({
  controllers: [BillingController, AdminBillingController],
  providers: [BillingService, DepositAddressService, ProfitFeeScheduler, BscDepositScanner],
  exports: [BillingService],
})
export class BillingModule {}
