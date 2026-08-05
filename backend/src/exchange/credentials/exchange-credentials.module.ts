import { Module, forwardRef } from '@nestjs/common';
import { BinanceModule } from '../binance/binance.module';
import { CredentialCryptoService } from './credential-crypto.service';
import { ExchangeAccountManagementService } from './exchange-account-management.service';
import { ExchangeCredentialsController } from './exchange-credentials.controller';
import { ExchangeCredentialsService } from './exchange-credentials.service';

@Module({
  imports: [forwardRef(() => BinanceModule)],
  controllers: [ExchangeCredentialsController],
  providers: [
    CredentialCryptoService,
    ExchangeCredentialsService,
    ExchangeAccountManagementService,
  ],
  exports: [ExchangeCredentialsService, ExchangeAccountManagementService],
})
export class ExchangeCredentialsModule {}
