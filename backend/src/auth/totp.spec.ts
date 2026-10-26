import { base32Decode, base32Encode, generateTotpSecret, totpCode, totpStep, verifyTotp } from './totp';

describe('TOTP', () => {
  // RFC 6238 appendix B, SHA-1 secret "12345678901234567890".
  const rfcSecret = Buffer.from('12345678901234567890', 'ascii');

  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('matches the RFC 6238 test vector at %i seconds', (seconds, expected) => {
    expect(totpCode(rfcSecret, totpStep(seconds * 1000), 8)).toBe(expected);
  });

  it('round-trips base32 secrets', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('accepts the current code and one step of drift, nothing older', () => {
    const secret = base32Encode(rfcSecret);
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = (offset: number) => totpCode(rfcSecret, step + offset);
    expect(verifyTotp(secret, code(0), now)).toBe(step);
    expect(verifyTotp(secret, code(-1), now)).toBe(step - 1);
    expect(verifyTotp(secret, code(1), now)).toBe(step + 1);
    expect(verifyTotp(secret, code(-2), now)).toBeNull();
    expect(verifyTotp(secret, 'abc123', now)).toBeNull();
  });
});
