/**
 * ShieldCar — Ensamblador del Certificado Unificado (viewmodel).
 *
 * Toma el dictamen vehicular (Fase 1) y el de identidad (Fase 2), calcula
 * sus huellas SHA-256 y el sello maestro, y arma el objeto que consume la
 * UI. Puro y sin base de datos: lo usan tanto la página demo como el flujo
 * real (que además persiste con `createSealedCertificate`).
 */

import { hashPayload } from '@/lib/crypto/hash';
import { generateMasterSeal } from '@/lib/crypto/seal';
import type { KycReport } from '@/lib/identity/types';
import type { VehicleReport } from '@/lib/report/build-report';

export interface UnifiedCertificate {
  vehicleReport: VehicleReport;
  kycReport: KycReport;
  vehicleHash: string;
  identityHash: string;
  masterSealHash: string;
  sealedAt: string; // ISO 8601
}

export function buildUnifiedCertificate(
  vehicleReport: VehicleReport,
  kycReport: KycReport,
  sealedAt: string = new Date().toISOString(),
): UnifiedCertificate {
  const vehicleHash = hashPayload(vehicleReport);
  const identityHash = hashPayload(kycReport);
  const masterSealHash = generateMasterSeal(
    vehicleHash,
    identityHash,
    sealedAt,
  );
  return {
    vehicleReport,
    kycReport,
    vehicleHash,
    identityHash,
    masterSealHash,
    sealedAt,
  };
}

/** Enmascara el NIV dejando visibles solo los últimos 4 caracteres. */
export function maskVin(vin: string): string {
  if (vin.length <= 4) return vin;
  return `${'•'.repeat(vin.length - 4)}${vin.slice(-4)}`;
}
