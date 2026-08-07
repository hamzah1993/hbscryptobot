import { BadRequestException, Injectable } from '@nestjs/common';
import { ExchangeEnvironment } from '@prisma/client';
import { BinanceService } from '../binance/binance.service';
import { ExchangeCredentialsService } from './exchange-credentials.service';

@Injectable()
export class ExchangeAccountManagementService {
  constructor(
    private readonly credentials: ExchangeCredentialsService,
    private readonly binance: BinanceService,
  ) {}

  async testBinanceTestnetConnection(userId: string) {
    const credential = await this.credentials.getBinance(
      userId,
      ExchangeEnvironment.TESTNET,
    );

    const account = await this.binance.getAccount(
      credential.apiKey,
      credential.apiSecret,
      'testnet',
    );

    return {
      connected: true,
      exchange: 'BINANCE',
      environment: 'TESTNET',
      canTrade: Boolean((account as any)?.canTrade),
      accountType: (account as any)?.accountType ?? null,
    };
  }

  async validateBinanceLiveCredentials(apiKey: string, apiSecret: string) {
    const account = await this.binance.getAccount(apiKey.trim(), apiSecret.trim(), 'live') as any;
    const permissions = Array.isArray(account?.permissions)
      ? account.permissions.map((permission: unknown) => String(permission).toUpperCase())
      : [];
    const accountType = String(account?.accountType ?? '').toUpperCase();
    const spotEnabled = accountType === 'SPOT' || permissions.includes('SPOT');
    const canTrade = account?.canTrade === true;
    const canWithdraw = account?.canWithdraw === true;

    if (!canTrade || !spotEnabled) {
      throw new BadRequestException('Binance LIVE API key must have Spot trading permission');
    }
    if (canWithdraw) {
      throw new BadRequestException('Binance LIVE API key must not have withdrawal permission');
    }

    return {
      connected: true,
      exchange: 'BINANCE',
      environment: 'LIVE',
      canTrade,
      canWithdraw,
      spotEnabled,
      accountType: account?.accountType ?? null,
      permissions,
    };
  }

  async testBinanceLiveConnection(userId: string) {
    const credential = await this.credentials.getBinance(userId, ExchangeEnvironment.LIVE);
    return this.validateBinanceLiveCredentials(credential.apiKey, credential.apiSecret);
  }

  async getBinanceTestnetBalances(userId: string) {
    const credential = await this.credentials.getBinance(
      userId,
      ExchangeEnvironment.TESTNET,
    );

    const account = (await this.binance.getAccount(
      credential.apiKey,
      credential.apiSecret,
      'testnet',
    )) as any;

    const balances = Array.isArray(account?.balances)
      ? account.balances
          .map((balance: any) => ({
            asset: String(balance.asset ?? ''),
            free: Number(balance.free ?? 0),
            locked: Number(balance.locked ?? 0),
          }))
          .filter((balance: { free: number; locked: number }) =>
            balance.free > 0 || balance.locked > 0,
          )
      : [];

    return {
      exchange: 'BINANCE',
      environment: 'TESTNET',
      canTrade: Boolean(account?.canTrade),
      balances,
    };
  }

  assertTestnetOnly(environment?: ExchangeEnvironment) {
    if (environment && environment !== ExchangeEnvironment.TESTNET) {
      throw new BadRequestException(
        'Exchange account management is limited to Binance Testnet',
      );
    }
  }
}
