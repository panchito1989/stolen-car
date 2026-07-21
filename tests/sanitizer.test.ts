import { describe, expect, test } from 'vitest';
import {
  buildUnifiedCertificate,
  type UnifiedCertificate,
} from '@/lib/certificate/build-certificate';
import { sanitizeForPublicView } from '@/lib/verify/sanitizer';
import { MockIdentityProvider } from '@/lib/identity/mock-provider';
import { buildReport } from '@/lib/report/build-report';

const VALID_VIN = '3N1AB7AP0KY000000';
const FULL_CURP = 'PEGJ850315HDFLRN05';
const SEALED_AT = '2026-07-21T18:00:00.000Z';

async function makeCertificate(
  vehicleScenario: Parameters<typeof buildReport>[0]['scenario'] = 'clean',
  identityScenario:
    | 'valid_ine'
    | 'expired_ine'
    | 'curp_mismatch'
    | 'face_mismatch'
    | 'fake_document' = 'valid_ine',
): Promise<UnifiedCertificate> {
  const vehicleReport = await buildReport({
    vin: VALID_VIN,
    scenario: vehicleScenario,
    delayMs: 0,
  });
  const kycReport = await new MockIdentityProvider({
    scenario: identityScenario,
    delayMs: 0,
  }).verifyIdentity({ frontImage: 'x', backImage: 'x', selfieFrame: 'x' });
  return buildUnifiedCertificate(vehicleReport, kycReport, SEALED_AT);
}

describe('sanitizeForPublicView', () => {
  test('masks the VIN leaving only the last 4 characters', async () => {
    const cert = await makeCertificate();
    const view = sanitizeForPublicView({ ...cert, status: 'SEALED' });
    expect(view.maskedVin).toBe('•••••••••••••0000');
    expect(view.maskedVin).toMatch(/0000$/);
  });

  test('reduces the seller name to first name + surname initial', async () => {
    const cert = await makeCertificate();
    const view = sanitizeForPublicView({ ...cert, status: 'SEALED' });
    // Persona base del mock: JUAN PEREZ GALINDO → "Juan P."
    expect(view.identity.displayName).toBe('Juan P.');
  });

  test('exposes seal hash, UTC timestamp and status', async () => {
    const cert = await makeCertificate();
    const view = sanitizeForPublicView({ ...cert, status: 'SEALED' });
    expect(view.seal.hash).toBe(cert.masterSealHash);
    expect(view.seal.sealedAtUtc).toBe(SEALED_AT);
    expect(view.seal.status).toBe('SEALED');
  });

  test('exposes only the global verdict labels (auto + identidad)', async () => {
    const cert = await makeCertificate('clean', 'valid_ine');
    const view = sanitizeForPublicView({ ...cert, status: 'SEALED' });
    expect(view.vehicle.label).toBe('LIMPIO');
    expect(view.vehicle.verdict).toBe('ok');
    expect(view.identity.label).toBe('IDENTIDAD VÁLIDA');
    expect(view.identity.verdict).toBe('ok');
  });

  test('maps a risky vehicle + rejected identity to public labels', async () => {
    const cert = await makeCertificate('stolen', 'face_mismatch');
    const view = sanitizeForPublicView({ ...cert, status: 'SEALED' });
    expect(view.vehicle.label).toBe('RECHAZADO');
    expect(view.identity.label).toBe('IDENTIDAD RECHAZADA');
  });

  test('carries the VOIDED status through', async () => {
    const cert = await makeCertificate();
    const view = sanitizeForPublicView({ ...cert, status: 'VOIDED' });
    expect(view.seal.status).toBe('VOIDED');
  });

  // -------------------------------------------------------------------------
  // REGRESIÓN DE PRIVACIDAD: el payload público NUNCA debe filtrar PII.
  // -------------------------------------------------------------------------
  test('SECURITY: serialized output never leaks the full VIN or CURP', async () => {
    for (const [v, i] of [
      ['clean', 'valid_ine'],
      ['stolen', 'face_mismatch'],
      ['debts', 'expired_ine'],
      ['fake_invoice', 'curp_mismatch'],
    ] as const) {
      const cert = await makeCertificate(v, i);
      const view = sanitizeForPublicView({ ...cert, status: 'SEALED' });
      const json = JSON.stringify(view);

      expect(json).not.toContain(VALID_VIN);
      expect(json).not.toContain(FULL_CURP);
      // Apellidos completos y clave de elector jamás salen.
      expect(json).not.toContain('PEREZ');
      expect(json).not.toContain('GALINDO');
      expect(json).not.toContain(cert.kycReport.ine.claveElector);
      // Tampoco las imágenes/fotos ni el score biométrico crudo.
      expect(json.toLowerCase()).not.toContain('base64');
    }
  });
});
