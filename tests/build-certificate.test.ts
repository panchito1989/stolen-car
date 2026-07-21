import { describe, expect, test } from 'vitest';
import {
  buildUnifiedCertificate,
  maskVin,
} from '@/lib/certificate/build-certificate';
import { generateMasterSeal } from '@/lib/crypto/seal';
import { MockIdentityProvider } from '@/lib/identity/mock-provider';
import { buildReport } from '@/lib/report/build-report';

const VALID_VIN = '3N1AB7AP0KY000000';

describe('maskVin', () => {
  test('reveals only the last 4 characters', () => {
    expect(maskVin(VALID_VIN)).toBe('•••••••••••••0000');
    expect(maskVin('3N1AB7AP0KY0004352')).toMatch(/4352$/);
  });

  test('short strings are returned untouched', () => {
    expect(maskVin('ABCD')).toBe('ABCD');
  });
});

describe('buildUnifiedCertificate', () => {
  async function makeInputs() {
    const vehicleReport = await buildReport({
      vin: VALID_VIN,
      scenario: 'clean',
      delayMs: 0,
    });
    const kycReport = await new MockIdentityProvider({
      scenario: 'valid_ine',
      delayMs: 0,
    }).verifyIdentity({ frontImage: 'x', backImage: 'x', selfieFrame: 'x' });
    return { vehicleReport, kycReport };
  }

  test('ties both reports with a reproducible master seal', async () => {
    const { vehicleReport, kycReport } = await makeInputs();
    const sealedAt = '2026-07-21T12:00:00.000Z';

    const cert = buildUnifiedCertificate(vehicleReport, kycReport, sealedAt);

    expect(cert.masterSealHash).toBe(
      generateMasterSeal(cert.vehicleHash, cert.identityHash, sealedAt),
    );
    expect(cert.vehicleHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cert.identityHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
