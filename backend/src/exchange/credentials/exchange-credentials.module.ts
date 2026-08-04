import { Module } from '@nestjs/common';
import { CredentialCryptoService } from './credential-crypto.service';
import { ExchangeCredentialsController } from './exchange-credentials.controller';
import { ExchangeCredentialsService } from './exchange-credentials.service';

@Module({
  controllers: [ExchangeCredentialsController],
  providers: [CredentialCryptoService, ExchangeCredentialsService],
  exports: [ExchangeCredentialsService],
})
export class ExchangeCredentialsModule {}
