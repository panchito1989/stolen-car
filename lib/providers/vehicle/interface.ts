/**
 * ShieldCar — Puerto `VehicleDataProvider` (patrón puertos y adaptadores).
 *
 * Todo acceso a datos vehiculares pasa por este contrato. Los adaptadores
 * concretos (mock, agregador REPUVE, PAC del SAT…) se inyectan donde se
 * necesiten — cambiar de proveedor es escribir un adaptador nuevo, nunca
 * tocar el dominio ni la UI.
 *
 * Regla arquitectónica: los métodos asíncronos NUNCA lanzan por errores del
 * proveedor. Un timeout, un captcha o un 500 se traducen al veredicto
 * `unavailable` dentro de un `VerificationResult` normal, con el error crudo
 * en `rawPayload`. Así la capa de persistencia siempre tiene algo que
 * hashear e insertar en `audit_log`, y la UI siempre tiene un semáforo que
 * pintar (transparencia radical: "esto NO se pudo verificar").
 */

import type {
  MexicanState,
  Verdict,
  VerificationResult,
} from '@/types/shieldcar';

// ---------------------------------------------------------------------------
// Resultados de las validaciones offline (puras, gratis, sin red)
// ---------------------------------------------------------------------------

export interface VinCheckDigitResult {
  /** VIN normalizado (mayúsculas, sin espacios/guiones). */
  vin: string;
  /**
   * `true`/`false` cuando el check digit aplica y se pudo evaluar;
   * `null` cuando el VIN está malformado o el estándar no aplica.
   */
  valid: boolean | null;
  /**
   * El dígito verificador (posición 9) solo es obligatorio en VINs de
   * Norteamérica (primer carácter 1–5). Un VIN europeo o asiático con
   * mismatch produce `warning`, no `fail`.
   */
  applicable: boolean;
  /** Dígito esperado según ISO 3779 ('0'–'9' o 'X'), null si malformado. */
  expected: string | null;
  /** Carácter real en la posición 9, null si malformado. */
  actual: string | null;
  verdict: Verdict;
  /** Explicación legible en español para la UI. */
  reason: string;
}

export interface WmiDecodeResult {
  /** Primeros 3 caracteres del VIN, o null si el VIN está malformado. */
  wmi: string | null;
  region:
    | 'north_america'
    | 'south_america'
    | 'africa'
    | 'asia'
    | 'europe'
    | 'oceania'
    | 'unknown';
  country: string | null;
  /** Fabricante según la tabla WMI local (seed extensible). */
  manufacturer: string | null;
  /** Año modelo decodificado de la posición 10, null si no determinable. */
  modelYear: number | null;
  verdict: Verdict;
  reason: string;
}

// ---------------------------------------------------------------------------
// Queries de las consultas remotas
// ---------------------------------------------------------------------------

export interface RepuveQuery {
  vin: string;
  plate?: string;
}

export interface DebtsQuery {
  plate: string;
  state: MexicanState;
}

export interface CfdiQuery {
  /** Folio fiscal (UUID) de la factura o re-facturación. */
  uuid: string;
  rfcEmisor: string;
  rfcReceptor: string;
  /** Total del CFDI como string decimal (el SAT lo pide para validar). */
  total?: string;
}

// ---------------------------------------------------------------------------
// El puerto
// ---------------------------------------------------------------------------

export interface VehicleDataProvider {
  /** Identificador del adaptador — viaja en `VerificationResult.provider`. */
  readonly name: string;

  // --- Validaciones puras (offline, deterministas, sin costo) ---

  /** Valida el dígito verificador del VIN (módulo 11, ISO 3779). */
  validateVinCheckDigit(vin: string): VinCheckDigitResult;

  /** Decodifica región/país/fabricante/año a partir del WMI y posición 10. */
  decodeWmi(vin: string): WmiDecodeResult;

  // --- Consultas remotas (asíncronas, con costo, nunca lanzan) ---

  /** Registro en REPUVE (existencia y consistencia de datos). */
  checkRepuve(query: RepuveQuery): Promise<VerificationResult>;

  /** Reporte de robo (REPUVE + fuentes estatales cuando existan). */
  checkTheftReport(query: RepuveQuery): Promise<VerificationResult>;

  /** Adeudos de tenencia/multas en el estado indicado. */
  checkDebts(query: DebtsQuery): Promise<VerificationResult>;

  /** Validación del CFDI (factura) ante el SAT por UUID. */
  checkSatCfdi(query: CfdiQuery): Promise<VerificationResult>;
}
