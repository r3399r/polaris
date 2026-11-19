import { describe, expect, it } from 'vitest';
import { secretMatches } from 'src/lib/secret';

describe('secretMatches', () => {
  it('accepts an exact match', () => {
    expect(secretMatches('abc123', 'abc123')).toBe(true);
  });

  it('rejects a different value of the same length', () => {
    expect(secretMatches('abc124', 'abc123')).toBe(false);
  });

  it('rejects a prefix', () => {
    expect(secretMatches('abc12', 'abc123')).toBe(false);
  });

  it('rejects a value that merely starts with the secret', () => {
    expect(secretMatches('abc1234', 'abc123')).toBe(false);
  });

  it('rejects an empty candidate', () => {
    expect(secretMatches('', 'abc123')).toBe(false);
  });

  it('is case sensitive', () => {
    expect(secretMatches('ABC123', 'abc123')).toBe(false);
  });

  // timingSafeEqual throws on buffers of different byte length, and a
  // multi-byte string is longer in bytes than in characters -- so the length
  // guard has to be on the buffers, not the strings.
  it('handles multi-byte input without throwing', () => {
    expect(secretMatches('中文', 'abcdef')).toBe(false);
  });
});
