/**
 * ShieldCar — Sanitizador de datos para la Vista Pública (/verify/[seal]).
 *
 * Regla de oro: lo que sale de aquí lo puede ver un desconocido a pie de
 * calle. NUNCA debe contener PII reidentificable: ni el NIV completo, ni la
 * CURP, ni apellidos completos, ni clave de elector, ni imágenes. Solo lo
 * mínimo para que el comprador confíe y compare contra el vehículo físico.
 *
 * Las pruebas de regresión en tests/sanitizer.test.ts serializan la salida y
 * verifican que estas cadenas jamás aparezcan.
 */

import { maskVin, type UnifiedCertificate } from '@/lib/certificate/build-certificate';
import type { CertificateStatus } from '@/lib/db/certificates';
import {
  KYC_VERDICT_TO_SEMAPHORE,
  type KycVerdictCode,
} from '@/lib/identity/types';
import type { Verdict } from '@/types/shieldcar';

/** El certificado sellado completo tal como se recupera de la base. */
export interface FullCertificate extends UnifiedCertificate {
  status: CertificateStatus;
}

export interface PublicVerdictSummary {
  verdict: Verdict;
  label: string;
}

export interface PublicIdentitySummary extends PublicVerdictSummary {
  /** Solo primer nombre + inicial del primer apellido, p.ej. "Juan P." */
  displayName: string;
}

export interface PublicCertificateView {
  maskedVin: string;
  vehicle: PublicVerdictSummary;
  identity: PublicIdentitySummary;
  seal: {
    hash: string;
    sealedAtUtc: string;
    status: Extract<CertificateStatus, 'SEALED' | 'VOIDED'>;
  };
}

/** Etiquetas públicas del semáforo (mayúsculas, para banners street-level). */
const PUBLIC_VEHICLE_LABEL: Record<Verdict, string> = {
  ok: 'LIMPIO',
  warning: 'ADVERTENCIAS',
  fail: 'RECHAZADO',
  unavailable: 'SIN VERIFICAR',
};

const PUBLIC_IDENTITY_LABEL: Record<KycVerdictCode, string> = {
  VERIFIED: 'IDENTIDAD VÁLIDA',
  MANUAL_REVIEW: 'IDENTIDAD EN REVISIÓN',
  REJECTED: 'IDENTIDAD RECHAZADA',
};

function titleCase(word: string): string {
  if (word.length === 0) return word;
  return word[0]!.toUpperCase() + word.slice(1).toLowerCase();
}

/** "JUAN" + "PEREZ" → "Juan P."  (jamás el apellido completo). */
function maskName(nombre: string, primerApellido: string): string {
  const firstName = titleCase(nombre.trim().split(/\s+/)[0] ?? '');
  const initial = primerApellido.trim().charAt(0).toUpperCase();
  return initial ? `${firstName} ${initial}.` : firstName;
}

export function sanitizeForPublicView(
  certificate: FullCertificate,
): PublicCertificateView {
  const { vehicleReport, kycReport, masterSealHash, sealedAt, status } =
    certificate;

  const identitySemaphore = KYC_VERDICT_TO_SEMAPHORE[kycReport.verdict];

  // El estatus público solo distingue SEALED vs VOIDED. Un DRAFT nunca
  // debería llegar a la vista pública; si llega, se degrada a VOIDED (no
  // confiable) por seguridad.
  const publicStatus: 'SEALED' | 'VOIDED' =
    status === 'SEALED' ? 'SEALED' : 'VOIDED';

  return {
    maskedVin: maskVin(vehicleReport.vin),
    vehicle: {
      verdict: vehicleReport.global.verdict,
      label: PUBLIC_VEHICLE_LABEL[vehicleReport.global.verdict],
    },
    identity: {
      verdict: identitySemaphore,
      label: PUBLIC_IDENTITY_LABEL[kycReport.verdict],
      displayName: maskName(kycReport.ine.nombre, kycReport.ine.primerApellido),
    },
    seal: {
      hash: masterSealHash,
      sealedAtUtc: sealedAt,
      status: publicStatus,
    },
  };
}
