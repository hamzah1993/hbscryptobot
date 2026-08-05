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
