import { describe, expect, test } from 'vitest';
import {
  decodeWmi,
  normalizeVin,
  sanitizeVinInput,
  validateVinCheckDigit,
} from '@/lib/providers/vehicle/local-vin-provider';
import { canTransition } from '@/types/shieldcar';

describe('normalizeVin', () => {
  test('uppercases and strips spaces and hyphens', () => {
    expect(normalizeVin(' 1hg-cm82633a004352 ')).toBe('1HGCM82633A004352');
  });
});

describe('sanitizeVinInput (filtro en vivo para el campo de captura)', () => {
  test('uppercases as the user types', () => {
    expect(sanitizeVinInput('3n1ab7')).toBe('3N1AB7');
  });

  test('drops forbidden VIN letters I, O, Q and other invalid chars', () => {
    expect(sanitizeVinInput('3O1-IQ #ab!7ñ')).toBe('31AB7');
  });

  test('caps length at 17 characters', () => {
    expect(sanitizeVinInput('11111111111111111999')).toBe(
      '11111111111111111',
    );
  });

  test('empty input stays empty', () => {
    expect(sanitizeVinInput('')).toBe('');
  });
});

describe('validateVinCheckDigit (ISO 3779, módulo 11)', () => {
  test('accepts a known-valid North American VIN', () => {
    const r = validateVinCheckDigit('1HGCM82633A004352');
    expect(r.valid).toBe(true);
    expect(r.applicable).toBe(true);
    expect(r.expected).toBe('3');
    expect(r.actual).toBe('3');
    expect(r.verdict).toBe('ok');
  });

  test('accepts the canonical all-ones VIN', () => {
    const r = validateVinCheckDigit('11111111111111111');
    expect(r.valid).toBe(true);
    expect(r.verdict).toBe('ok');
  });

  test('detects a single altered character as fail on a NA VIN', () => {
    // Same VIN as above with the last char changed 2 -> 3.
    const r = validateVinCheckDigit('1HGCM82633A004353');
    expect(r.valid).toBe(false);
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe('fail');
  });

  test('normalizes input before validating', () => {
    const r = validateVinCheckDigit(' 1hgcm82633a004352 ');
    expect(r.valid).toBe(true);
    expect(r.vin).toBe('1HGCM82633A004352');
  });

  test('rejects VINs with forbidden letters I, O, Q as malformed', () => {
    const r = validateVinCheckDigit('1HGCM82633A00435O');
    expect(r.valid).toBe(null);
    expect(r.verdict).toBe('fail');
  });

  test('rejects VINs that are not 17 characters as malformed', () => {
    const r = validateVinCheckDigit('1HGCM82633A0043');
    expect(r.valid).toBe(null);
    expect(r.verdict).toBe('fail');
  });

  test('a European VIN with mismatch yields warning, not fail', () => {
    // WMI 'WVW' (Germany) — check digit is not mandatory outside NA.
    const r = validateVinCheckDigit('WVWZZZ1JZXW000001');
    expect(r.applicable).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.verdict).toBe('warning');
  });
});

describe('decodeWmi', () => {
  test('decodes a Mexican Nissan VIN', () => {
    const r = decodeWmi('3N1AB7AP5KY000000');
    expect(r.wmi).toBe('3N1');
    expect(r.region).toBe('north_america');
    expect(r.country).toBe('México');
    expect(r.manufacturer).toContain('Nissan');
    expect(r.verdict).toBe('ok');
  });

  test('decodes a US Honda VIN including model year from position 10', () => {
    const r = decodeWmi('1HGCM82633A004352');
    expect(r.wmi).toBe('1HG');
    expect(r.region).toBe('north_america');
    expect(r.country).toBe('Estados Unidos');
    expect(r.manufacturer).toContain('Honda');
    expect(r.modelYear).toBe(2003);
  });

  test('decodes region for a Japanese motorcycle VIN', () => {
    const r = decodeWmi('JYARN23E0FA000000');
    expect(r.region).toBe('asia');
    expect(r.country).toBe('Japón');
  });

  test('unknown manufacturer still resolves region with warning', () => {
    const r = decodeWmi('3ZZAB7AP5KY000000');
    expect(r.region).toBe('north_america');
    expect(r.manufacturer).toBe(null);
    expect(r.verdict).toBe('warning');
  });

  test('malformed VIN yields fail and null fields', () => {
    const r = decodeWmi('NOPE');
    expect(r.wmi).toBe(null);
    expect(r.verdict).toBe('fail');
  });
});

describe('transaction state machine', () => {
  test('allows the happy-path first step', () => {
    expect(canTransition('draft', 'seller_verified')).toBe(true);
  });

  test('forbids skipping steps', () => {
    expect(canTransition('draft', 'signed')).toBe(false);
  });

  test('terminal states cannot transition anywhere', () => {
    expect(canTransition('closed', 'draft')).toBe(false);
    expect(canTransition('cancelled', 'draft')).toBe(false);
  });

  test('a red verification can freeze the expediente', () => {
    expect(canTransition('vehicle_registered', 'flagged')).toBe(true);
  });
});
