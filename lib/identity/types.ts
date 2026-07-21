/**
 * ShieldCar — Tipos del Módulo de Identidad (Fase 2: KYC ligero).
 *
 * El dictamen de identidad usa tres veredictos (no cuatro como el semáforo
 * vehicular) porque en identidad no existe "fuente no disponible parcial":
 * o la persona queda verificada, o se rechaza, o un humano debe revisar.
 * Para pintar la UI se mapean al semáforo: VERIFIED→ok, MANUAL_REVIEW→warning,
 * REJECTED→fail.
 */

import type { Verdict } from '@/types/shieldcar';

export type KycVerdictCode = 'VERIFIED' | 'REJECTED' | 'MANUAL_REVIEW';

export const KYC_VERDICT_TO_SEMAPHORE: Record<KycVerdictCode, Verdict> = {
  VERIFIED: 'ok',
  MANUAL_REVIEW: 'warning',
  REJECTED: 'fail',
};

/** Modelos de credencial INE en circulación (letra del reverso). */
export type IneModel = 'D' | 'E' | 'F' | 'G' | 'H';

/** Datos extraídos por OCR de la credencial (frente + reverso). */
export interface IneData {
  curp: string;
  claveElector: string;
  nombre: string;
  primerApellido: string;
  segundoApellido: string | null;
  /** Año de nacimiento no: fecha completa ISO (AAAA-MM-DD). */
  fechaNacimiento: string;
  sexo: 'H' | 'M';
  /** Año en que vence la credencial (campo "VIGENCIA"). */
  vigencia: number;
  modelo: IneModel;
  /** CIC: 9 dígitos del reverso (modelos D en adelante). */
  cic: string;
  /** OCR: 13 dígitos (modelos antiguos); null en modelos recientes. */
  ocr: string | null;
  /** Entidad de registro (clave de 2 letras de la CURP). */
  entidad: string;
}

/** Resultado de la comparación facial selfie ↔ foto de la INE. */
export interface BiometricResult {
  /** Similitud 0–100 entre el rostro en vivo y la foto de la credencial. */
  faceMatchScore: number;
  /** ¿La prueba de vida detectó una persona real (no foto/pantalla)? */
  livenessPassed: boolean;
  /** Confianza 0–100 de la prueba de vida. */
  livenessScore: number;
}

/** Checks individuales que alimentan el veredicto (ver decideKycVerdict). */
export interface KycChecks {
  curpValid: boolean;
  claveElectorValid: boolean;
  vigente: boolean;
  /** false = se detectó edición digital / alteración física del documento. */
  documentIntact: boolean;
  faceMatchScore: number;
  livenessPassed: boolean;
}

/** El Dictamen de Identidad completo. */
export interface KycReport {
  provider: string;
  generatedAt: string; // ISO 8601
  ine: IneData;
  biometric: BiometricResult;
  checks: KycChecks;
  verdict: KycVerdictCode;
  /** Motivos legibles (vacío cuando VERIFIED). */
  reasons: string[];
}

/** Entrada de la verificación: imágenes en Base64 o referencias a storage. */
export interface KycCaptureInput {
  frontImage: string;
  backImage: string;
  selfieFrame: string;
}

/** Puerto del proveedor de identidad (mock hoy; Nubarium/MetaMap mañana). */
export interface IdentityProvider {
  readonly name: string;
  verifyIdentity(input: KycCaptureInput): Promise<KycReport>;
}
