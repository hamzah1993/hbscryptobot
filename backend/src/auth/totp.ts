import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Time-based one-time passwords (RFC 6238) as used by Google Authenticator, Authy, 1Password, etc. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buffer: Buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs = Date.now()) {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

export function totpCode(secret: Buffer, step: number, digits = DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, '0');
}

/**
 * Returns the matching time step for a code (allowing one step of clock
 * drift either way), or null. Callers reject steps at or before the last one
 * used, so a code cannot be replayed.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs = Date.now()) {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(nowMs);
  for (const step of [current - 1, current, current + 1]) {
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(normalized))) return step;
  }
  return null;
}

export function otpauthUrl(secretBase32: string, accountName: string, issuer = 'HBS Trading') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}
