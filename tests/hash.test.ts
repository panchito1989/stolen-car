import { describe, expect, test } from 'vitest';
import { hashPayload, sha256Hex } from '@/lib/crypto/hash';

describe('sha256Hex', () => {
  test('matches a known SHA-256 vector', () => {
    expect(sha256Hex('hola')).toBe(
      'b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79',
    );
  });

  test('always returns 64 lowercase hex chars', () => {
    expect(sha256Hex('')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashPayload (hash estable para el audit_log)', () => {
  test('is deterministic regardless of object key order', () => {
    expect(hashPayload({ a: 1, b: { d: 4, c: 3 } })).toBe(
      hashPayload({ b: { c: 3, d: 4 }, a: 1 }),
    );
  });

  test('different payloads produce different hashes', () => {
    expect(hashPayload({ estatus: 'SIN REPORTE' })).not.toBe(
      hashPayload({ estatus: 'CON REPORTE DE ROBO' }),
    );
  });

  test('handles arrays, nulls and primitives', () => {
    expect(hashPayload([1, null, 'x'])).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPayload(null)).toMatch(/^[0-9a-f]{64}$/);
  });
});
