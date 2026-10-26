import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CredentialCryptoService } from '../exchange/credentials/credential-crypto.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [NotificationsModule, BillingModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, TwoFactorService, CredentialCryptoService],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
