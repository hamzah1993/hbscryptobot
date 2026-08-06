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

  async upsertBybit(
    userId: string,
    apiKey: string,
    apiSecret: string,
    environment: ExchangeEnvironment,
  ) {
    return this.upsertExchange(userId, ExchangeName.BYBIT, apiKey, apiSecret, environment);
  }

  async upsertOkx(
    userId: string,
    apiKey: string,
    apiSecret: string,
    passphrase: string,
    environment: ExchangeEnvironment,
  ) {
    if (!passphrase.trim()) throw new NotFoundException('OKX API passphrase is required');
    return this.upsertExchange(userId, ExchangeName.OKX, apiKey, apiSecret, environment, passphrase);
  }

  private async upsertExchange(
    userId: string,
    exchange: ExchangeName,
    apiKey: string,
    apiSecret: string,
    environment: ExchangeEnvironment,
    passphrase?: string,
  ) {
    const key = this.crypto.encrypt(apiKey.trim());
    const secret = this.crypto.encrypt(apiSecret.trim());
    const encryptedPassphrase = passphrase ? this.crypto.encrypt(passphrase.trim()) : null;
    return this.prisma.exchangeCredential.upsert({
      where: { userId_exchange_environment: { userId, exchange, environment } },
      update: {
        apiKeyCipher: key.cipherText,
        secretCipher: secret.cipherText,
        passphraseCipher: encryptedPassphrase?.cipherText ?? null,
        iv: JSON.stringify({ apiKey: key.iv, apiSecret: secret.iv, passphrase: encryptedPassphrase?.iv }),
        authTag: JSON.stringify({ apiKey: key.authTag, apiSecret: secret.authTag, passphrase: encryptedPassphrase?.authTag }),
      },
      create: {
        userId, exchange, environment,
        apiKeyCipher: key.cipherText,
        secretCipher: secret.cipherText,
        passphraseCipher: encryptedPassphrase?.cipherText ?? null,
        iv: JSON.stringify({ apiKey: key.iv, apiSecret: secret.iv, passphrase: encryptedPassphrase?.iv }),
        authTag: JSON.stringify({ apiKey: key.authTag, apiSecret: secret.authTag, passphrase: encryptedPassphrase?.authTag }),
      },
      select: { id: true, exchange: true, environment: true, createdAt: true, updatedAt: true },
    });
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
    return this.removeExchange(userId, ExchangeName.BINANCE, environment);
  }

  async removeExchange(userId: string, exchange: ExchangeName, environment: ExchangeEnvironment) {
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: {
        userId_exchange_environment: {
          userId,
          exchange,
          environment,
        },
      },
      select: { id: true },
    });
    if (!credential) throw new NotFoundException(`${exchange} credentials not found`);

    await this.prisma.exchangeCredential.delete({ where: { id: credential.id } });
    return { deleted: true };
  }

  async getBinance(userId: string, environment: ExchangeEnvironment) {
    return this.getExchange(userId, ExchangeName.BINANCE, environment);
  }

  async getBybit(userId: string, environment: ExchangeEnvironment) {
    return this.getExchange(userId, ExchangeName.BYBIT, environment);
  }

  async getOkx(userId: string, environment: ExchangeEnvironment) {
    const value = await this.getExchange(userId, ExchangeName.OKX, environment);
    if (!value.passphrase) throw new NotFoundException('OKX API passphrase is not configured');
    return { apiKey: value.apiKey, apiSecret: value.apiSecret, passphrase: value.passphrase };
  }

  private async getExchange(userId: string, exchange: ExchangeName, environment: ExchangeEnvironment) {
    const credential = await this.prisma.exchangeCredential.findUnique({
      where: {
        userId_exchange_environment: {
          userId,
          exchange,
          environment,
        },
      },
    });
    if (!credential) throw new NotFoundException(`${exchange} credentials not found`);

    const iv = JSON.parse(credential.iv) as { apiKey: string; apiSecret: string; passphrase?: string };
    const authTag = JSON.parse(credential.authTag) as { apiKey: string; apiSecret: string; passphrase?: string };

    return {
      apiKey: this.crypto.decrypt(credential.apiKeyCipher, iv.apiKey, authTag.apiKey),
      apiSecret: this.crypto.decrypt(credential.secretCipher, iv.apiSecret, authTag.apiSecret),
      passphrase: credential.passphraseCipher && iv.passphrase && authTag.passphrase
        ? this.crypto.decrypt(credential.passphraseCipher, iv.passphrase, authTag.passphrase)
        : undefined,
    };
  }
}
