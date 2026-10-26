import { HDNodeWallet } from 'ethers';
import { DepositAddressService } from './deposit-address.service';

describe('DepositAddressService', () => {
  const mnemonic = 'test test test test test test test test test test test junk';
  const account = HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'");
  const config = (value?: string) => ({ get: jest.fn().mockReturnValue(value) }) as any;

  it('derives the same addresses a wallet holding the seed controls', () => {
    const service = new DepositAddressService(config(account.neuter().extendedKey));
    expect(service.enabled).toBe(true);
    for (const index of [0, 1, 42]) {
      const expected = HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`).address.toLowerCase();
      expect(service.addressFor(index)).toBe(expected);
    }
  });

  it('refuses a private extended key so spendable keys never live on the server', () => {
    const service = new DepositAddressService(config(account.extendedKey));
    expect(service.enabled).toBe(false);
    expect(service.addressFor(0)).toBeNull();
  });

  it('is disabled when unset or invalid', () => {
    expect(new DepositAddressService(config(undefined)).enabled).toBe(false);
    expect(new DepositAddressService(config('not-a-key')).enabled).toBe(false);
  });
});
