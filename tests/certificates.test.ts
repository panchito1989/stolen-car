import { describe, expect, test } from 'vitest';
import { hashPayload } from '@/lib/crypto/hash';
import { generateMasterSeal } from '@/lib/crypto/seal';
import {
  createSealedCertificate,
  saveIdentity,
} from '@/lib/db/certificates';
import { persistReport } from '@/lib/db/repository';
import { MockIdentityProvider } from '@/lib/identity/mock-provider';
import { buildReport } from '@/lib/report/build-report';
import { FakeDb } from './helpers/fake-db';

const VALID_VIN = '3N1AB7AP0KY000000';

const CAPTURE = {
  frontImage: 'x',
  backImage: 'x',
  selfieFrame: 'x',
};

async function makeReports() {
  const vehicleReport = await buildReport({
    vin: VALID_VIN,
    scenario: 'clean',
    delayMs: 0,
  });
  const kycReport = await new MockIdentityProvider({
    scenario: 'valid_ine',
    delayMs: 0,
  }).verifyIdentity(CAPTURE);
  return { vehicleReport, kycReport };
}

describe('saveIdentity', () => {
  test('persists the KYC verdict with its payload hash and returns the id', async () => {
    const db = new FakeDb();
    const { kycReport } = await makeReports();
    const payloadHash = hashPayload(kycReport);

    const identityId = await saveIdentity(db, kycReport, payloadHash);

    expect(db.tables.identities).toHaveLength(1);
    const row = db.tables.identities[0];
    expect(row?.id).toBe(identityId);
    expect(row?.curp).toBe(kycReport.ine.curp);
    expect(row?.status).toBe('VERIFIED');
    expect(row?.biometric_match_score).toBe(
      kycReport.biometric.faceMatchScore,
    );
    expect(row?.payload_hash).toBe(payloadHash);
  });
});

describe('createSealedCertificate', () => {
  test('seals the certificate and chains CERTIFICATE_SEALED into the audit log', async () => {
    const db = new FakeDb();
    const { vehicleReport, kycReport } = await makeReports();

    const { vehicleId } = await persistReport(db, vehicleReport);
    const identityHash = hashPayload(kycReport);
    const identityId = await saveIdentity(db, kycReport, identityHash);
    const vehicleHash = hashPayload(vehicleReport);

    const cert = await createSealedCertificate(db, {
      vehicleId,
      sellerIdentityId: identityId,
      vehicleHash,
      identityHash,
    });

    // Certificado persistido y sellado.
    expect(db.tables.certificates).toHaveLength(1);
    const row = db.tables.certificates[0];
    expect(row?.status).toBe('SEALED');
    expect(row?.vehicle_id).toBe(vehicleId);
    expect(row?.seller_identity_id).toBe(identityId);

    // El sello es reproducible con los mismos insumos (inmutabilidad).
    expect(cert.masterSealHash).toBe(
      generateMasterSeal(vehicleHash, identityHash, cert.sealedAt),
    );
    expect(row?.master_seal_hash).toBe(cert.masterSealHash);

    // El evento quedó encadenado con el sello maestro como payload.
    const auditEvents = db.tables.audit_log.map((e) => e.event);
    expect(auditEvents).toContain('CERTIFICATE_SEALED');
    const sealedEvent = db.tables.audit_log.find(
      (e) => e.event === 'CERTIFICATE_SEALED',
    );
    expect(sealedEvent?.payload_hash).toBe(cert.masterSealHash);

    // Y la cadena sigue íntegra: su prev_hash es el hash del evento anterior
    // (VEHICLE_REPORT_GENERATED de persistReport).
    const previous = db.tables.audit_log.find(
      (e) => e.event === 'VEHICLE_REPORT_GENERATED',
    );
    expect(sealedEvent?.prev_hash).toBe(previous?.hash);
  });

  test('rejects malformed input hashes before touching the database', async () => {
    const db = new FakeDb();
    await expect(
      createSealedCertificate(db, {
        vehicleId: 'v1',
        sellerIdentityId: 'i1',
        vehicleHash: 'nope',
        identityHash: 'b'.repeat(64),
      }),
    ).rejects.toThrow(/hash/i);
    expect(db.tables.certificates).toHaveLength(0);
    expect(db.tables.audit_log).toHaveLength(0);
  });
});
