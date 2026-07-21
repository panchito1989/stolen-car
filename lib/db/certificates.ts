/**
 * ShieldCar — Repositorio de Certificados Unificados.
 *
 * Persiste el KYC (tabla `identities`) y el Certificado Unificado (tabla
 * `certificates`), y encadena el evento CERTIFICATE_SEALED al audit_log
 * usando el sello maestro como nuevo eslabón. Misma resiliencia offline
 * que el resto: sin Supabase, el llamador maneja el fallback.
 */

import { generateMasterSeal } from '@/lib/crypto/seal';
import { appendAuditLog, type DbClient } from '@/lib/db/repository';
import type { KycReport } from '@/lib/identity/types';

export type CertificateStatus = 'DRAFT' | 'SEALED' | 'VOIDED';

// ---------------------------------------------------------------------------
// identities
// ---------------------------------------------------------------------------

/** Guarda el resultado del KYC y devuelve el id de la identidad. */
export async function saveIdentity(
  db: DbClient,
  report: KycReport,
  payloadHash: string,
): Promise<string> {
  const res = await db
    .from('identities')
    .insert({
      curp: report.ine.curp,
      document_type: `INE-${report.ine.modelo}`,
      status: report.verdict,
      biometric_match_score: report.biometric.faceMatchScore,
      payload_hash: payloadHash,
    })
    .select('id')
    .single();

  if (res.error || !res.data || typeof res.data.id !== 'string') {
    throw new Error(
      `identities: insert falló: ${res.error?.message ?? 'sin fila devuelta'}`,
    );
  }
  return res.data.id;
}

// ---------------------------------------------------------------------------
// certificates
// ---------------------------------------------------------------------------

export interface CreateCertificateInput {
  vehicleId: string;
  sellerIdentityId: string;
  vehicleHash: string;
  identityHash: string;
}

export interface SealedCertificate {
  certificateId: string;
  masterSealHash: string;
  sealedAt: string; // ISO 8601 — entra al sello, se persiste idéntico
  status: CertificateStatus;
}

/**
 * Crea un certificado ya SELLADO: genera el sello maestro, lo persiste y
 * encadena CERTIFICATE_SEALED al audit_log con el sello como payload_hash.
 * El sello se calcula ANTES de tocar la base, así una entrada inválida
 * (hash malformado) falla sin dejar filas a medias.
 */
export async function createSealedCertificate(
  db: DbClient,
  input: CreateCertificateInput,
): Promise<SealedCertificate> {
  const sealedAt = new Date().toISOString();
  // Valida los hashes y produce el sello antes de cualquier escritura.
  const masterSealHash = generateMasterSeal(
    input.vehicleHash,
    input.identityHash,
    sealedAt,
  );

  const res = await db
    .from('certificates')
    .insert({
      vehicle_id: input.vehicleId,
      seller_identity_id: input.sellerIdentityId,
      vehicle_hash: input.vehicleHash,
      identity_hash: input.identityHash,
      master_seal_hash: masterSealHash,
      status: 'SEALED' satisfies CertificateStatus,
      sealed_at: sealedAt,
    })
    .select('id')
    .single();

  if (res.error || !res.data || typeof res.data.id !== 'string') {
    throw new Error(
      `certificates: insert falló: ${res.error?.message ?? 'sin fila devuelta'}`,
    );
  }

  // El sello maestro se vuelve el nuevo eslabón de la cadena probatoria.
  await appendAuditLog(db, {
    actor: 'system',
    event: 'CERTIFICATE_SEALED',
    payloadHash: masterSealHash,
  });

  return {
    certificateId: res.data.id,
    masterSealHash,
    sealedAt,
    status: 'SEALED',
  };
}
