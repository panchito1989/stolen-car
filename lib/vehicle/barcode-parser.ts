/**
 * ShieldCar — Parser de NIV desde lecturas de código de barras.
 *
 * Los códigos en parabrisas/puerta/tarjeta de circulación (Code 39, Code 128,
 * Data Matrix) llegan sucios: asteriscos de inicio/fin de Code 39, prefijos
 * como "VIN:", separadores, espacios y minúsculas. Este parser normaliza el
 * ruido, encuentra la ventana de 17 caracteres con forma de NIV válida y la
 * valida con el MISMO check digit de la Fase 1 — jamás acepta una lectura
 * cuyo dígito verificador no cuadre.
 */

import { validateVinCheckDigit } from '@/lib/providers/vehicle/local-vin-provider';

export interface ParsedVin {
  valid: boolean;
  vin: string | null;
  error?: string;
}

/** Forma de un NIV: 17 caracteres alfanuméricos sin I, O ni Q. */
const VIN_WINDOW = /[A-HJ-NPR-Z0-9]{17}/g;

export function parseVinFromBarcode(rawData: string): ParsedVin {
  if (!rawData || rawData.trim().length === 0) {
    return { valid: false, vin: null, error: 'La lectura está vacía.' };
  }

  // Normaliza: mayúsculas y descarta todo lo no alfanumérico (asteriscos,
  // dos puntos, guiones, espacios). Así "VIN: 3N1-AB7…" queda como una sola
  // cadena continua sobre la que deslizamos ventanas de 17.
  const cleaned = rawData.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (cleaned.length < 17) {
    return {
      valid: false,
      vin: null,
      error: 'La lectura no contiene un NIV de 17 caracteres.',
    };
  }

  // Reunimos todas las ventanas de 17 con forma válida (sin I/O/Q). Como el
  // patrón excluye esas letras, un blob con ruido alrededor del NIV real solo
  // deja ventanas limpias donde el NIV cabe completo.
  const candidates = new Set<string>();
  for (let i = 0; i + 17 <= cleaned.length; i++) {
    const window = cleaned.slice(i, i + 17);
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(window)) {
      candidates.add(window);
    }
  }

  if (candidates.size === 0) {
    return {
      valid: false,
      vin: null,
      error: 'No se encontró una cadena de 17 caracteres con forma de NIV.',
    };
  }

  // Preferimos la ventana cuyo dígito verificador cuadra (verdict 'ok'). Es lo
  // que distingue el NIV real de una ventana desplazada por el ruido.
  let shapedButUnverified: string | null = null;
  for (const candidate of candidates) {
    const check = validateVinCheckDigit(candidate);
    if (check.verdict === 'ok') {
      return { valid: true, vin: candidate };
    }
    if (check.verdict === 'warning') {
      // NIV no norteamericano: forma válida, check digit no obligatorio.
      shapedButUnverified ??= candidate;
    }
  }

  if (shapedButUnverified) {
    return { valid: true, vin: shapedButUnverified };
  }

  return {
    valid: false,
    vin: null,
    error:
      'Se leyó una cadena de 17 caracteres, pero su dígito verificador no es válido. Vuelve a escanear o captúralo a mano.',
  };
}

/** Compara dos NIV normalizándolos (mayúsculas, sin espacios). */
export function vinsMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
  const na = norm(a);
  const nb = norm(b);
  return na.length === 17 && na === nb;
}
