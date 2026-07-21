import { describe, expect, test } from 'vitest';
import { generateMasterSeal } from '@/lib/crypto/seal';

const VEHICLE_HASH = 'a'.repeat(64);
const IDENTITY_HASH = 'b'.repeat(64);
const SEALED_AT = '2026-07-21T12:00:00.000Z';

describe('generateMasterSeal', () => {
  test('produces a 64-char lowercase hex seal', () => {
    const seal = generateMasterSeal(VEHICLE_HASH, IDENTITY_HASH, SEALED_AT);
    expect(seal).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is immutable: same inputs always produce the exact same seal', () => {
    const a = generateMasterSeal(VEHICLE_HASH, IDENTITY_HASH, SEALED_AT);
    const b = generateMasterSeal(VEHICLE_HASH, IDENTITY_HASH, SEALED_AT);
    expect(a).toBe(b);
  });

  test('changing the vehicle hash changes the seal', () => {
    const a = generateMasterSeal(VEHICLE_HASH, IDENTITY_HASH, SEALED_AT);
    const b = generateMasterSeal('c'.repeat(64), IDENTITY_HASH, SEALED_AT);
    expect(a).not.toBe(b);
  });

  test('changing the identity hash changes the seal', () => {
    const a = generateMasterSeal(VEHICLE_HASH, IDENTITY_HASH, SEALED_AT);
    const b = generateMasterSeal(VEHICLE_HASH, 'c'.repeat(64), SEALED_AT);
    expect(a).not.toBe(b);
  });

  test('changing the timestamp changes the seal', () => {
    const a = generateMasterSeal(VEHICLE_HASH, IDENTITY_HASH, SEALED_AT);
    const b = generateMasterSeal(
      VEHICLE_HASH,
      IDENTITY_HASH,
      '2026-07-21T12:00:00.001Z',
    );
    expect(a).not.toBe(b);
  });

  test('roles are not interchangeable: swapping the hashes changes the seal', () => {
    const a = generateMasterSeal(VEHICLE_HASH, IDENTITY_HASH, SEALED_AT);
    const b = generateMasterSeal(IDENTITY_HASH, VEHICLE_HASH, SEALED_AT);
    expect(a).not.toBe(b);
  });

  test('rejects malformed hashes (not 64 hex)', () => {
    expect(() =>
      generateMasterSeal('nope', IDENTITY_HASH, SEALED_AT),
    ).toThrow(/hash/i);
    expect(() =>
      generateMasterSeal(VEHICLE_HASH, 'B'.repeat(64), SEALED_AT),
    ).toThrow(/hash/i);
  });

  test('rejects a non-ISO timestamp', () => {
    expect(() =>
      generateMasterSeal(VEHICLE_HASH, IDENTITY_HASH, 'ayer en la tarde'),
    ).toThrow(/timestamp|fecha/i);
  });
});
