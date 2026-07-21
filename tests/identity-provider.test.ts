import { describe, expect, test } from 'vitest';
import { MockIdentityProvider } from '@/lib/identity/mock-provider';
import { validateCurp } from '@/lib/identity/validators';

function makeProvider(
  scenario?:
    | 'valid_ine'
    | 'expired_ine'
    | 'curp_mismatch'
    | 'face_mismatch'
    | 'fake_document',
) {
  return new MockIdentityProvider({ scenario, delayMs: 0 });
}

const CAPTURE = {
  frontImage: 'data:image/jpeg;base64,SIMULADO_FRENTE',
  backImage: 'data:image/jpeg;base64,SIMULADO_REVERSO',
  selfieFrame: 'data:image/jpeg;base64,SIMULADO_SELFIE',
};

describe('MockIdentityProvider — contrato', () => {
  test('exposes a provider name and returns ISO timestamps', async () => {
    const p = makeProvider();
    expect(p.name).toBe('mock-identity');
    const report = await p.verifyIdentity(CAPTURE);
    expect(new Date(report.generatedAt).toISOString()).toBe(
      report.generatedAt,
    );
    expect(report.provider).toBe('mock-identity');
  });

  test('defaults to the valid_ine scenario', async () => {
    const report = await makeProvider().verifyIdentity(CAPTURE);
    expect(report.verdict).toBe('VERIFIED');
  });
});

describe('MockIdentityProvider — escenarios', () => {
  test('valid_ine: VERIFIED with real CURP structure and face match > 95', async () => {
    const report = await makeProvider('valid_ine').verifyIdentity(CAPTURE);
    expect(report.verdict).toBe('VERIFIED');
    expect(validateCurp(report.ine.curp).valid).toBe(true);
    expect(report.biometric.faceMatchScore).toBeGreaterThan(95);
    expect(report.biometric.livenessPassed).toBe(true);
    expect(report.checks.vigente).toBe(true);
    expect(report.reasons).toHaveLength(0);
  });

  test('expired_ine: MANUAL_REVIEW with vigencia in the past', async () => {
    const report = await makeProvider('expired_ine').verifyIdentity(CAPTURE);
    expect(report.verdict).toBe('MANUAL_REVIEW');
    expect(report.ine.vigencia).toBeLessThan(new Date().getFullYear());
    expect(report.checks.vigente).toBe(false);
  });

  test('curp_mismatch: REJECTED because the OCR CURP fails validation', async () => {
    const report = await makeProvider('curp_mismatch').verifyIdentity(CAPTURE);
    expect(report.verdict).toBe('REJECTED');
    expect(validateCurp(report.ine.curp).valid).toBe(false);
    expect(report.checks.curpValid).toBe(false);
  });

  test('face_mismatch: REJECTED with score < 40', async () => {
    const report = await makeProvider('face_mismatch').verifyIdentity(CAPTURE);
    expect(report.verdict).toBe('REJECTED');
    expect(report.biometric.faceMatchScore).toBeLessThan(40);
  });

  test('fake_document: REJECTED flagging digital tampering', async () => {
    const report = await makeProvider('fake_document').verifyIdentity(CAPTURE);
    expect(report.verdict).toBe('REJECTED');
    expect(report.checks.documentIntact).toBe(false);
    expect(report.reasons.join(' ')).toMatch(/alterad|editad/i);
  });
});
