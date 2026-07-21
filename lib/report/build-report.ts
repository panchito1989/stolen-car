/**
 * ShieldCar — Constructor del "Reporte ShieldCar" (Fase 1).
 *
 * Orquesta las verificaciones contra un `VehicleDataProvider` (hoy el mock,
 * mañana el agregador real: mismo puerto, cero cambios aquí) y produce el
 * DTO que consumen la API route y la tarjeta de dictamen.
 *
 * Reglas de agregación del semáforo global:
 *   - cualquier `fail`  → global `fail`   ("Riesgo grave")
 *   - si no hay fail pero hay `warning` o `unavailable` → global `warning`
 *     (una fuente no verificada JAMÁS cuenta como limpio — transparencia
 *     radical)
 *   - todo `ok` → global `ok` ("Limpio")
 *
 * El veredicto del WMI no entra a la agregación: que el fabricante no esté
 * en el catálogo local es informativo, no una señal de fraude.
 */

import { hashPayload } from '@/lib/crypto/hash';
import type {
  VehicleDataProvider,
  VinCheckDigitResult,
  WmiDecodeResult,
} from '@/lib/providers/vehicle/interface';
import {
  MockVehicleProvider,
  type MockScenario,
} from '@/lib/providers/vehicle/mock-aggregator';
import type {
  Verdict,
  VerificationResult,
  VerificationType,
} from '@/types/shieldcar';

// ---------------------------------------------------------------------------
// DTO del reporte
// ---------------------------------------------------------------------------

export interface ReportCheck {
  type: Extract<
    VerificationType,
    'repuve' | 'theft_report' | 'debts' | 'sat_cfdi'
  >;
  result: VerificationResult;
  /** SHA-256 del payload crudo — listo para `audit_log.payload_hash`. */
  payloadHash: string;
}

export interface GlobalVerdict {
  verdict: Verdict;
  /** Etiqueta corta para el sello: Limpio / Advertencias / Riesgo grave. */
  label: string;
  summary: string;
}

export interface VehicleReport {
  vin: string;
  scenario: MockScenario;
  generatedAt: string; // ISO 8601
  local: {
    check: VinCheckDigitResult;
    wmi: WmiDecodeResult;
  };
  checks: ReportCheck[];
  global: GlobalVerdict;
}

// ---------------------------------------------------------------------------
// Agregación
// ---------------------------------------------------------------------------

export function worstVerdict(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.includes('fail')) return 'fail';
  if (verdicts.includes('warning') || verdicts.includes('unavailable')) {
    return 'warning';
  }
  return 'ok';
}

const GLOBAL_LABELS: Record<Verdict, GlobalVerdict> = {
  ok: {
    verdict: 'ok',
    label: 'Limpio',
    summary:
      'Todas las fuentes consultadas coinciden y no hay señales de alerta.',
  },
  warning: {
    verdict: 'warning',
    label: 'Advertencias',
    summary:
      'Hay puntos que requieren atención o fuentes que no pudieron verificarse. Revisa el desglose antes de continuar.',
  },
  fail: {
    verdict: 'fail',
    label: 'Riesgo grave',
    summary:
      'Se detectó al menos una alerta crítica. NO continúes la operación.',
  },
  // La agregación nunca produce 'unavailable' global, pero el mapa es total.
  unavailable: {
    verdict: 'unavailable',
    label: 'Sin verificar',
    summary: 'No fue posible consultar las fuentes.',
  },
};

// ---------------------------------------------------------------------------
// Construcción del reporte
// ---------------------------------------------------------------------------

export interface BuildReportOptions {
  vin: string;
  scenario?: MockScenario;
  /** Latencia simulada; la ruta usa el default del provider. */
  delayMs?: number;
  /** Inyección de dependencias: cualquier adaptador del puerto sirve. */
  provider?: VehicleDataProvider;
  /**
   * Reloj fijo (ISO 8601) para timestamps del reporte. Sin esto, el reporte
   * incrusta la hora real y su hash cambia en cada construcción; los flujos
   * deterministas (demo/registro público) DEBEN pasarlo para que el sello sea
   * reproducible entre rutas.
   */
  now?: string;
}

export async function buildReport(
  options: BuildReportOptions,
): Promise<VehicleReport> {
  const scenario = options.scenario ?? 'clean';
  const provider =
    options.provider ??
    new MockVehicleProvider({
      scenario,
      delayMs: options.delayMs,
      now: options.now,
    });

  // 1) Validación local primero: si el NIV ni siquiera tiene forma válida,
  //    no gastamos una sola consulta remota.
  const check = provider.validateVinCheckDigit(options.vin);
  if (check.valid === null) {
    throw new Error(`NIV inválido: ${check.reason}`);
  }
  const wmi = provider.decodeWmi(check.vin);

  // 2) Las 4 consultas remotas en paralelo.
  //    Placa y datos de factura reales se capturan más adelante en el flujo
  //    de Fase 1; por ahora la demo usa identificadores de relleno.
  const [repuve, theft, debts, cfdi] = await Promise.all([
    provider.checkRepuve({ vin: check.vin }),
    provider.checkTheftReport({ vin: check.vin }),
    provider.checkDebts({ plate: 'DEMO000', state: 'CDMX' }),
    provider.checkSatCfdi({
      uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      rfcEmisor: 'DEMO000000XX0',
      rfcReceptor: 'XAXX010101000',
    }),
  ]);

  const bare: Omit<ReportCheck, 'payloadHash'>[] = [
    { type: 'repuve', result: repuve },
    { type: 'theft_report', result: theft },
    { type: 'debts', result: debts },
    { type: 'sat_cfdi', result: cfdi },
  ];
  const checks: ReportCheck[] = bare.map((c) => ({
    ...c,
    payloadHash: hashPayload(c.result.rawPayload),
  }));

  // 3) Semáforo global: check digit local + las 4 fuentes remotas.
  const globalVerdict = worstVerdict([
    check.verdict,
    ...checks.map((c) => c.result.verdict),
  ]);

  return {
    vin: check.vin,
    scenario,
    generatedAt: options.now ?? new Date().toISOString(),
    local: { check, wmi },
    checks,
    global: GLOBAL_LABELS[globalVerdict],
  };
}
