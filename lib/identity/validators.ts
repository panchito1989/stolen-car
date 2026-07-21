/**
 * ShieldCar — Validadores locales de documentos de identidad mexicanos.
 *
 * Igual que la validación de NIV: todo esto corre offline, gratis y ANTES
 * de gastar una consulta de pago (Lista Nominal, RENAPO). Un CURP con
 * dígito verificador inválido detecta al instante errores de OCR y
 * falsificaciones burdas.
 */

import type { KycChecks, KycVerdictCode } from '@/lib/identity/types';
import type { Verdict } from '@/types/shieldcar';

export interface FieldValidation {
  valid: boolean;
  verdict: Verdict;
  reason: string;
}

// ---------------------------------------------------------------------------
// CURP (RENAPO): 18 caracteres + dígito verificador base-37
// ---------------------------------------------------------------------------

/** Claves oficiales de entidad federativa dentro de la CURP. */
const CURP_STATES = new Set([
  'AS', 'BC', 'BS', 'CC', 'CL', 'CM', 'CS', 'CH', 'DF', 'DG', 'GT', 'GR',
  'HG', 'JC', 'MC', 'MN', 'MS', 'NT', 'NL', 'OC', 'PL', 'QT', 'QR', 'SP',
  'SL', 'SR', 'TC', 'TS', 'TL', 'VZ', 'YN', 'ZS',
  'NE', // Nacido en el Extranjero
]);

const CURP_SHAPE =
  /^[A-Z][AEIOUX][A-Z]{2}(\d{2})(\d{2})(\d{2})[HM]([A-Z]{2})[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;

/** Alfabeto base-37 oficial del algoritmo de RENAPO (incluye Ñ). */
const CURP_ALPHABET = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

function curpCheckDigit(curp17: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += CURP_ALPHABET.indexOf(curp17[i] as string) * (18 - i);
  }
  return String((10 - (sum % 10)) % 10);
}

export interface CurpValidation extends FieldValidation {
  curp: string;
}

export function validateCurp(input: string): CurpValidation {
  const curp = input.trim().toUpperCase();
  const fail = (reason: string): CurpValidation => ({
    curp,
    valid: false,
    verdict: 'fail',
    reason,
  });

  const match = CURP_SHAPE.exec(curp);
  if (!match) {
    return fail(
      'La CURP no cumple la estructura oficial de 18 caracteres (RENAPO).',
    );
  }

  const [, , month, day, state] = match;
  const m = Number(month);
  const d = Number(day);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return fail('La fecha de nacimiento dentro de la CURP es imposible.');
  }
  if (!CURP_STATES.has(state as string)) {
    return fail(
      `La clave de entidad '${state}' no existe en el catálogo oficial.`,
    );
  }

  const expected = curpCheckDigit(curp.slice(0, 17));
  if (curp[17] !== expected) {
    return fail(
      `El dígito verificador de la CURP no cuadra (se esperaba '${expected}'). Posible error de OCR o documento falsificado.`,
    );
  }

  return {
    curp,
    valid: true,
    verdict: 'ok',
    reason: 'CURP con estructura y dígito verificador correctos.',
  };
}

// ---------------------------------------------------------------------------
// Clave de elector: 6 consonantes + fecha (6) + entidad (2) + sexo + 3 dígitos
// ---------------------------------------------------------------------------

const CLAVE_ELECTOR_SHAPE = /^[A-Z]{6}\d{6}(\d{2})[HM]\d{3}$/;

export function validateClaveElector(input: string): FieldValidation {
  const clave = input.trim().toUpperCase();
  const match = CLAVE_ELECTOR_SHAPE.exec(clave);
  if (!match) {
    return {
      valid: false,
      verdict: 'fail',
      reason:
        'La clave de elector no cumple la estructura oficial de 18 caracteres.',
    };
  }
  const state = Number(match[1]);
  if (state < 1 || state > 32) {
    return {
      valid: false,
      verdict: 'fail',
      reason: `La clave de entidad '${match[1]}' está fuera del rango 01–32.`,
    };
  }
  return {
    valid: true,
    verdict: 'ok',
    reason: 'Clave de elector con estructura válida.',
  };
}

// ---------------------------------------------------------------------------
// CIC (modelos D+) y OCR (modelos A–C)
// ---------------------------------------------------------------------------

export function validateCic(input: string): FieldValidation {
  const ok = /^\d{9}$/.test(input.trim());
  return {
    valid: ok,
    verdict: ok ? 'ok' : 'fail',
    reason: ok
      ? 'CIC de 9 dígitos válido.'
      : 'El CIC debe ser exactamente 9 dígitos (reverso, modelos D en adelante).',
  };
}

export function validateOcr(input: string): FieldValidation {
  const ok = /^\d{13}$/.test(input.trim());
  return {
    valid: ok,
    verdict: ok ? 'ok' : 'fail',
    reason: ok
      ? 'OCR de 13 dígitos válido.'
      : 'El OCR debe ser exactamente 13 dígitos (credenciales modelo A–C).',
  };
}

// ---------------------------------------------------------------------------
// Reglas del dictamen
// ---------------------------------------------------------------------------

/** Umbral de coincidencia facial para verificación automática. */
export const FACE_MATCH_VERIFIED = 85;
/** Debajo de esto se considera suplantación, no ambigüedad. */
export const FACE_MATCH_REJECTED = 40;

export interface KycDecision {
  verdict: KycVerdictCode;
  reasons: string[];
}

/**
 * Orden de severidad: primero lo irrecuperable (documento alterado, CURP
 * inválida, suplantación, liveness fallido) → REJECTED; luego lo revisable
 * (vigencia vencida, coincidencia ambigua) → MANUAL_REVIEW; si nada suena,
 * VERIFIED con cero motivos.
 */
export function decideKycVerdict(checks: KycChecks): KycDecision {
  const rejected: string[] = [];
  const review: string[] = [];

  if (!checks.documentIntact) {
    rejected.push(
      'El documento presenta señales de haber sido alterado o editado digitalmente.',
    );
  }
  if (!checks.curpValid) {
    rejected.push('La CURP extraída no pasa la validación oficial.');
  }
  if (!checks.claveElectorValid) {
    rejected.push('La clave de elector no tiene una estructura válida.');
  }
  if (checks.faceMatchScore < FACE_MATCH_REJECTED) {
    rejected.push(
      `El rostro en vivo NO corresponde a la foto de la credencial (coincidencia ${checks.faceMatchScore}%). Posible suplantación de identidad.`,
    );
  }
  if (!checks.livenessPassed) {
    rejected.push(
      'La prueba de vida falló: podría tratarse de una foto impresa, una pantalla o un video pregrabado.',
    );
  }

  if (rejected.length > 0) {
    return { verdict: 'REJECTED', reasons: rejected };
  }

  if (!checks.vigente) {
    review.push(
      'La vigencia de la credencial está vencida. Verifica con una identificación adicional.',
    );
  }
  if (checks.faceMatchScore < FACE_MATCH_VERIFIED) {
    review.push(
      `La coincidencia facial (${checks.faceMatchScore}%) es ambigua; se requiere revisión manual.`,
    );
  }

  if (review.length > 0) {
    return { verdict: 'MANUAL_REVIEW', reasons: review };
  }

  return { verdict: 'VERIFIED', reasons: [] };
}
