/**
 * ShieldCar — Motor de Sellado Criptográfico (Certificado Unificado).
 *
 * El "sello maestro" liga inseparablemente el dictamen del VEHÍCULO con el
 * dictamen de IDENTIDAD del vendedor, más el instante exacto del sellado.
 * Es la pieza que hace inrepudiable el expediente: si alguien altera el
 * reporte del auto, el del vendedor, o pretende reusar el sello con otra
 * fecha, el hash deja de cuadrar.
 *
 * Usa la MISMA utilidad SHA-256 estable de la Fase 1 (hashPayload), así que
 * el sello es determinista e independiente del orden de claves.
 */

import { hashPayload } from '@/lib/crypto/hash';

const HASH_SHAPE = /^[0-9a-f]{64}$/;

/** Etiqueta de dominio: evita colisiones con hashes de otros contextos. */
const SEAL_DOMAIN = 'shieldcar.master-seal.v1';

function assertHash(label: string, value: string): void {
  if (!HASH_SHAPE.test(value)) {
    throw new Error(
      `El ${label} no es un hash SHA-256 válido (64 hex en minúsculas).`,
    );
  }
}

function assertIsoTimestamp(value: string): void {
  // Debe ser una fecha real Y round-trip exacto a ISO 8601 (rechaza
  // "2026-13-40" que Date "corrige", y textos libres).
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new Error(
      `El timestamp de sellado debe ser una fecha ISO 8601 exacta (recibido: "${value}").`,
    );
  }
}

/**
 * Genera el sello maestro inmutable a partir de los dos dictámenes y el
 * instante de sellado. Los campos van etiquetados por rol, de modo que
 * intercambiar los dos hashes produce un sello distinto (no son simétricos).
 */
export function generateMasterSeal(
  vehicleHash: string,
  identityHash: string,
  timestamp: string,
): string {
  assertHash('hash del reporte vehicular', vehicleHash);
  assertHash('hash del reporte de identidad', identityHash);
  assertIsoTimestamp(timestamp);

  return hashPayload({
    domain: SEAL_DOMAIN,
    vehicleHash,
    identityHash,
    sealedAt: timestamp,
  });
}
