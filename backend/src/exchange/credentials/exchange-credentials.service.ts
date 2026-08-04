import { Injectable, NotFoundException } from '@nestjs/common';
import { ExchangeEnvironment, ExchangeName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CredentialCryptoService } from './credential-crypto.service';

@Injectable()
export class ExchangeCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialCryptoService,
  ) {}

  async upsertBinance(
    userId: string,
    apiKey: string,
    apiSecret: string,
    environment: ExchangeEnvironment,
  ) {
    const key = this.crypto.encrypt(apiKey.trim());
    const secret = this.crypto.encrypt(apiSecret.trim());

    const credential = await this.prisma.exchangeCredential.upsert({
      where: {
        userId_exchange_environment: {
          userId,
          exchange: ExchangeName.BINANCE,
          environment,
        },
      },
      update: {
        apiKeyCipher: key.cipherText,
        secretCipher: secret.cipherText,
        iv: JSON.stringify({ apiKey: key.iv, apiSecret: secret.iv }),
        authTag: JSON.stringify({ apiKey: key.authTag, apiSecret: secret.authTag }),
      },
      create: {
        userId,
        exchange: ExchangeName.BINANCE,
        environment,
        apiKeyCipher: key.cipherText,
        secretCipher: secret.cipherText,
        iv: JSON.stringify({ apiKey: key.iv, apiSecret: secret.iv }),
        authTag: JSON.stringify({ apiKey: key.authTag, apiSecret: secret.authTag }),
      },
      select: {
        id: true,
        exchange: true,
        environment: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return credential;
  }

  async list(userId: string) {
    return this.prisma.exchangeCredential.findMany({
      where: { userId },
      select: {
        id: true,
        exchange: true,
        environment: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async removeBinance(userId: string, environment: ExchangeEnvironment) {
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: {
        userId_exchange_environment: {
          userId,
          exchange: ExchangeName.BINANCE,
          environment,
        },
      },
      select: { id: true },
    });
    if (!credential) throw new NotFoundException('Binance credentials not found');

    await this.prisma.exchangeCredential.delete({ where: { id: credential.id } });
    return { deleted: true };
  }

  async getBinance(userId: string, environment: ExchangeEnvironment) {
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: {
        userId_exchange_environment: {
          userId,
          exchange: ExchangeName.BINANCE,
          environment,
        },
      },
    });
    if (!credential) throw new NotFoundException('Binance credentials not found');

    const iv = JSON.parse(credential.iv) as { apiKey: string; apiSecret: string };
    const authTag = JSON.parse(credential.authTag) as { apiKey: string; apiSecret: string };

    return {
      apiKey: this.crypto.decrypt(credential.apiKeyCipher, iv.apiKey, authTag.apiKey),
      apiSecret: this.crypto.decrypt(credential.secretCipher, iv.apiSecret, authTag.apiSecret),
    };
  }
}
