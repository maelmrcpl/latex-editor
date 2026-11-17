import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const KEY_LEN = 64;

/**
 * Formats a password hash as `scrypt$<saltHex>$<keyHex>`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password.normalize('NFKC'), salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verifies a password against a `scrypt$<saltHex>$<keyHex>` hash in constant time.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length !== KEY_LEN) {
    return false;
  }
  const actual = scryptSync(password.normalize('NFKC'), salt, KEY_LEN, SCRYPT_PARAMS);
  return timingSafeEqual(actual, expected);
}

/**
 * Constant-time string comparison (prevents username enumeration timing side-channels).
 */
export function safeCompareStrings(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB) && a.length === b.length;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
