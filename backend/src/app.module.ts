import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { SignOptions } from 'jsonwebtoken';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { BinanceModule } from './exchange/binance/binance.module';
import { ExchangeCredentialsModule } from './exchange/credentials/exchange-credentials.module';
import { DemoExchangeModule } from './exchange/demo/demo-exchange.module';
import { MarketDataModule } from './market/market-data.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { getGlobalRateLimitConfiguration } from './rate-limit.config';
import { RedisLockModule } from './redis/redis-lock.module';
import { TradingEngineModule } from './trading/trading-engine.module';
import { UsersModule } from './users/users.module';

const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? '1d') as SignOptions['expiresIn'];
const globalRateLimit = getGlobalRateLimitConfiguration();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: globalRateLimit.ttlMilliseconds,
        limit: globalRateLimit.maxRequests,
      },
    ]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: jwtExpiresIn },
    }),
    PrismaModule,
    RedisLockModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    ExchangeCredentialsModule,
    DemoExchangeModule,
    BinanceModule,
    MarketDataModule,
    TradingEngineModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
