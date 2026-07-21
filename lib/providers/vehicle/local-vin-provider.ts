/**
 * ShieldCar — Validación local de VIN/NIV (offline, pura, sin costo).
 *
 * Implementa la parte determinista del puerto `VehicleDataProvider`:
 *   - Check digit módulo 11 (ISO 3779) — detecta NIVs alterados/inventados
 *     ANTES de gastar una sola consulta de pago a REPUVE o al SAT.
 *   - Decodificación de WMI (región/país/fabricante) y año modelo.
 *
 * Sin dependencias externas: estas funciones corren igual en el navegador
 * (validación instantánea en el formulario) que en el servidor. Cualquier
 * adaptador remoto (mock, agregador real) delega aquí sus métodos puros.
 */

import type {
  VinCheckDigitResult,
  WmiDecodeResult,
} from '@/lib/providers/vehicle/interface';

// ---------------------------------------------------------------------------
// Normalización y forma
// ---------------------------------------------------------------------------

/** VIN válido: 17 caracteres alfanuméricos, sin I, O ni Q. */
const VIN_SHAPE = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

// ---------------------------------------------------------------------------
// Check digit ISO 3779 (módulo 11)
// ---------------------------------------------------------------------------

/** Transliteración de letras a valores numéricos según ISO 3779. */
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

/** Pesos por posición (1–17). La posición 9 es el check digit (peso 0). */
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;

function charValue(ch: string): number {
  return ch >= '0' && ch <= '9' ? Number(ch) : (TRANSLITERATION[ch] ?? 0);
}

function computeCheckDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += charValue(vin[i] as string) * (WEIGHTS[i] as number);
  }
  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/**
 * El check digit es obligatorio solo en Norteamérica (primer carácter 1–5,
 * que incluye México con el prefijo '3'). Fuera de NA muchos fabricantes
 * no lo calculan, así que un mismatch ahí es `warning`, no `fail`.
 */
function isNorthAmerican(vin: string): boolean {
  const first = vin[0] as string;
  return first >= '1' && first <= '5';
}

export function validateVinCheckDigit(input: string): VinCheckDigitResult {
  const vin = normalizeVin(input);

  if (!VIN_SHAPE.test(vin)) {
    return {
      vin,
      valid: null,
      applicable: false,
      expected: null,
      actual: null,
      verdict: 'fail',
      reason:
        'El NIV está malformado: debe tener 17 caracteres alfanuméricos sin las letras I, O ni Q.',
    };
  }

  const expected = computeCheckDigit(vin);
  const actual = vin[8] as string;
  const applicable = isNorthAmerican(vin);
  const valid = expected === actual;

  if (valid) {
    return {
      vin,
      valid,
      applicable,
      expected,
      actual,
      verdict: 'ok',
      reason: 'El dígito verificador del NIV es consistente (ISO 3779).',
    };
  }

  return {
    vin,
    valid,
    applicable,
    expected,
    actual,
    verdict: applicable ? 'fail' : 'warning',
    reason: applicable
      ? `Dígito verificador inválido: se esperaba '${expected}' y el NIV trae '${actual}'. Posible NIV alterado o mal transcrito.`
      : `El dígito verificador no coincide, pero este NIV no es norteamericano y el estándar no lo exige. Verifica el resto de los datos.`,
  };
}

// ---------------------------------------------------------------------------
// Decodificación de WMI (World Manufacturer Identifier)
// ---------------------------------------------------------------------------

type Region = WmiDecodeResult['region'];

/** Región según el primer carácter del VIN (ISO 3780). */
function regionOf(first: string): Region {
  if (first >= '1' && first <= '5') return 'north_america';
  if (first === '6' || first === '7') return 'oceania';
  if (first === '8' || first === '9' || first === '0') return 'south_america';
  if (first >= 'A' && first <= 'H') return 'africa';
  if (first >= 'J' && first <= 'R') return 'asia';
  if (first >= 'S' && first <= 'Z') return 'europe';
  return 'unknown';
}

/** País según el primer carácter (granularidad suficiente para el reporte). */
const COUNTRY_BY_FIRST: Record<string, string> = {
  '1': 'Estados Unidos',
  '2': 'Canadá',
  '3': 'México',
  '4': 'Estados Unidos',
  '5': 'Estados Unidos',
  '9': 'Brasil',
  J: 'Japón',
  K: 'Corea del Sur',
  L: 'China',
  S: 'Reino Unido',
  V: 'Francia/España',
  W: 'Alemania',
  Z: 'Italia',
};

/**
 * Tabla seed de WMIs frecuentes en el mercado mexicano (autos y motos).
 * Extensible: agregar aquí no rompe nada; un WMI desconocido produce
 * `warning` con región/país igualmente resueltos.
 */
const WMI_SEED: Record<string, string> = {
  // Autos — producción México
  '3N1': 'Nissan México',
  '3N6': 'Nissan México (pickups)',
  '3VW': 'Volkswagen México',
  '3G1': 'General Motors México (Chevrolet)',
  '3FA': 'Ford México',
  '3MZ': 'Mazda México',
  '3KP': 'Kia México',
  // Autos — importados frecuentes
  '1HG': 'Honda (Estados Unidos)',
  '1FA': 'Ford (Estados Unidos)',
  '2HG': 'Honda (Canadá)',
  JHM: 'Honda (Japón)',
  JN1: 'Nissan (Japón)',
  JT2: 'Toyota (Japón)',
  KMH: 'Hyundai (Corea del Sur)',
  WVW: 'Volkswagen (Alemania)',
  WBA: 'BMW (Alemania)',
  '9BW': 'Volkswagen (Brasil)',
  '9BD': 'Fiat (Brasil)',
  // Motos
  JYA: 'Yamaha (Japón)',
  JH2: 'Honda motocicletas (Japón)',
  JKA: 'Kawasaki (Japón)',
  JS1: 'Suzuki motocicletas (Japón)',
  LBP: 'Italika/Zongshen (China)',
  ME1: 'Yamaha (India)',
};

/**
 * Año modelo por la posición 10 (letras I, O, Q, U, Z y el 0 no se usan).
 * El código se repite cada 30 años; desambiguamos eligiendo el candidato
 * más reciente que no esté en el futuro (año actual + 1 por preventas).
 */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

function decodeModelYear(code: string, now = new Date()): number | null {
  const idx = YEAR_CODES.indexOf(code);
  if (idx === -1) return null;
  const maxYear = now.getFullYear() + 1;
  let year: number | null = null;
  for (let base = 1980; base + idx <= maxYear; base += 30) {
    year = base + idx;
  }
  return year;
}

export function decodeWmi(input: string): WmiDecodeResult {
  const vin = normalizeVin(input);

  if (!VIN_SHAPE.test(vin)) {
    return {
      wmi: null,
      region: 'unknown',
      country: null,
      manufacturer: null,
      modelYear: null,
      verdict: 'fail',
      reason: 'El NIV está malformado: no se puede decodificar el WMI.',
    };
  }

  const wmi = vin.slice(0, 3);
  const first = vin[0] as string;
  const region = regionOf(first);
  const country = COUNTRY_BY_FIRST[first] ?? null;
  const manufacturer = WMI_SEED[wmi] ?? null;
  const modelYear = decodeModelYear(vin[9] as string);

  return {
    wmi,
    region,
    country,
    manufacturer,
    modelYear,
    verdict: manufacturer ? 'ok' : 'warning',
    reason: manufacturer
      ? `WMI ${wmi}: ${manufacturer}.`
      : `WMI ${wmi} no está en el catálogo local; región y país sí se resolvieron. Verifica el fabricante contra la factura.`,
  };
}
