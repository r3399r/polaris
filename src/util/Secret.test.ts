import { secretMatches } from 'src/util/Secret';

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

  it('rejects a value with the secret as its prefix', () => {
    expect(secretMatches('abc1234', 'abc123')).toBe(false);
  });

  it('rejects an empty candidate', () => {
    expect(secretMatches('', 'abc123')).toBe(false);
  });

  it('is case sensitive', () => {
    expect(secretMatches('ABC123', 'abc123')).toBe(false);
  });

  it('handles multi-byte input without throwing', () => {
    expect(secretMatches('中文', 'abc123')).toBe(false);
  });
});
