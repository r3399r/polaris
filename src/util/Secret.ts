import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of an untrusted value against a secret.
 * Length is compared first and is not itself secret.
 */
export function secretMatches(given: string, expected: string) {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
