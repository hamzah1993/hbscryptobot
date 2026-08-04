import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BinanceModule } from './exchange/binance/binance.module';
import { ExchangeCredentialsModule } from './exchange/credentials/exchange-credentials.module';
import { MarketDataModule } from './market/market-data.module';
import { PrismaModule } from './prisma/prisma.module';
import { TradingEngineModule } from './trading/trading-engine.module';
import { UsersModule } from './users/users.module';

const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? '1d') as SignOptions['expiresIn'];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: jwtExpiresIn },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ExchangeCredentialsModule,
    BinanceModule,
    MarketDataModule,
    TradingEngineModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
