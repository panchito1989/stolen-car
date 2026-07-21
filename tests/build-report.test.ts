import { describe, expect, test } from 'vitest';
import { buildReport, worstVerdict } from '@/lib/report/build-report';

/**
 * VIN Nissan México con check digit válido:
 * suma ponderada = 253, 253 % 11 = 0 → dígito verificador '0' (posición 9).
 */
const VALID_VIN = '3N1AB7AP0KY000000';

describe('worstVerdict (agregación del semáforo global)', () => {
  test('all ok stays ok', () => {
    expect(worstVerdict(['ok', 'ok', 'ok'])).toBe('ok');
  });

  test('any fail dominates everything', () => {
    expect(worstVerdict(['ok', 'warning', 'fail', 'unavailable'])).toBe('fail');
  });

  test('unavailable counts as warning (an unverified source is never "clean")', () => {
    expect(worstVerdict(['ok', 'unavailable'])).toBe('warning');
  });

  test('warning without fail is warning', () => {
    expect(worstVerdict(['ok', 'warning'])).toBe('warning');
  });
});

describe('buildReport', () => {
  test('clean scenario yields a global ok report with 4 hashed checks', async () => {
    const report = await buildReport({
      vin: VALID_VIN,
      scenario: 'clean',
      delayMs: 0,
    });

    expect(report.global.verdict).toBe('ok');
    expect(report.vin).toBe(VALID_VIN);
    expect(report.local.check.verdict).toBe('ok');
    expect(report.local.wmi.manufacturer).toContain('Nissan');

    expect(report.checks).toHaveLength(4);
    const types = report.checks.map((c) => c.type).sort();
    expect(types).toEqual(['debts', 'repuve', 'sat_cfdi', 'theft_report']);
    for (const check of report.checks) {
      // Hash listo para insertarse en audit_log.payload_hash.
      expect(check.payloadHash).toMatch(/^[0-9a-f]{64}$/);
      expect(check.result.provider).toBe('mock');
    }
    expect(new Date(report.generatedAt).toISOString()).toBe(
      report.generatedAt,
    );
  });

  test('stolen scenario turns the global verdict to fail', async () => {
    const report = await buildReport({
      vin: VALID_VIN,
      scenario: 'stolen',
      delayMs: 0,
    });
    expect(report.global.verdict).toBe('fail');
    const theft = report.checks.find((c) => c.type === 'theft_report');
    expect(theft?.result.verdict).toBe('fail');
  });

  test('debts scenario yields a global warning', async () => {
    const report = await buildReport({
      vin: VALID_VIN,
      scenario: 'debts',
      delayMs: 0,
    });
    expect(report.global.verdict).toBe('warning');
  });

  test('unavailable sources yield warning, never a false "clean"', async () => {
    const report = await buildReport({
      vin: VALID_VIN,
      scenario: 'unavailable',
      delayMs: 0,
    });
    expect(report.global.verdict).toBe('warning');
  });

  test('a malformed VIN is rejected before spending any remote query', async () => {
    await expect(
      buildReport({ vin: 'NOPE', scenario: 'clean', delayMs: 0 }),
    ).rejects.toThrow(/NIV/);
  });
});
