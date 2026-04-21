import { describe, expect, test } from 'vitest';
import { canonicalJson, hashCanonical, sha256 } from '../src/util/hash.ts';

describe('sha256', () => {
  test('produces a deterministic hex digest for strings', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
    expect(sha256('hello')).toHaveLength(64);
  });

  test('differs across inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('canonicalJson', () => {
  test('sorts object keys recursively', () => {
    const a = canonicalJson({ b: 1, a: { y: 2, x: 1 } });
    const b = canonicalJson({ a: { x: 1, y: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  test('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('hashCanonical', () => {
  test('same content different key order hashes equal', () => {
    expect(hashCanonical({ a: 1, b: 2 })).toBe(hashCanonical({ b: 2, a: 1 }));
  });
});
