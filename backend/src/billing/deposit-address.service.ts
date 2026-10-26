import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HDNodeVoidWallet, HDNodeWallet } from 'ethers';

/**
 * Derives per-user USDT deposit addresses from a watch-only extended public
 * key (BIP-44 account level, e.g. m/44'/60'/0'). The server never holds
 * private keys, so a compromised server cannot move deposited funds.
 */
@Injectable()
export class DepositAddressService {
  private readonly logger = new Logger(DepositAddressService.name);
  private readonly root: HDNodeVoidWallet | null;

  constructor(config: ConfigService) {
    this.root = this.loadRoot(config.get<string>('DEPOSIT_XPUB')?.trim());
  }

  get enabled() {
    return this.root !== null;
  }

  /** Address on the external chain (…/0/index) for the given account index. */
  addressFor(index: number) {
    if (!this.root) return null;
    return this.root.deriveChild(0).deriveChild(index).address.toLowerCase();
  }

  private loadRoot(extendedKey: string | undefined) {
    if (!extendedKey) return null;
    try {
      const node = HDNodeWallet.fromExtendedKey(extendedKey);
      if (!(node instanceof HDNodeVoidWallet)) {
        // An xprv would put spendable keys on the server. Refuse it outright.
        this.logger.error('DEPOSIT_XPUB contains a private extended key; deposits are disabled. Configure the public xpub only.');
        return null;
      }
      return node;
    } catch (error) {
      this.logger.error(`DEPOSIT_XPUB is invalid; deposits are disabled (${error instanceof Error ? error.message : String(error)})`);
      return null;
    }
  }
}
