import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of an untrusted value against a secret.
 *
 * The length is compared first and is not itself treated as secret:
 * timingSafeEqual throws on differing lengths, and the length of a bearer token
 * is not what an attacker is missing.
 */
export const secretMatches = (given: string, expected: string) => {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
};
