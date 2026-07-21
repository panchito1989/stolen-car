/**
 * ShieldCar — Adaptador mock del puerto `VehicleDataProvider`.
 *
 * Permite construir y probar TODO el flujo (wizard, semáforos, máquina de
 * estados, persistencia en `verifications` y `audit_log`) antes de firmar
 * contrato con un solo proveedor de pago. Los escenarios son deterministas
 * para poder escribir pruebas E2E estables:
 *
 *   clean · stolen · debts · fake_invoice · unavailable
 *
 * Los métodos puros delegan en `local-vin-provider` — igual que lo hará
 * cualquier adaptador real, porque la validación offline nunca depende del
 * proveedor remoto.
 */

import type {
  CfdiQuery,
  DebtsQuery,
  RepuveQuery,
  VehicleDataProvider,
  VinCheckDigitResult,
  WmiDecodeResult,
} from '@/lib/providers/vehicle/interface';
import {
  decodeWmi,
  validateVinCheckDigit,
} from '@/lib/providers/vehicle/local-vin-provider';
import type { VerificationResult } from '@/types/shieldcar';

export type MockScenario =
  | 'clean'
  | 'stolen'
  | 'debts'
  | 'fake_invoice'
  | 'unavailable';

export interface MockVehicleProviderOptions {
  scenario?: MockScenario;
  /** Latencia simulada por consulta. Default 300 ms; usar 0 en pruebas. */
  delayMs?: number;
}

function sleep(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

export class MockVehicleProvider implements VehicleDataProvider {
  readonly name = 'mock';

  private readonly scenario: MockScenario;
  private readonly delayMs: number;

  constructor(options: MockVehicleProviderOptions = {}) {
    this.scenario = options.scenario ?? 'clean';
    this.delayMs = options.delayMs ?? 300;
  }

  // --- Métodos puros: delegan en la validación local, como todo adaptador ---

  validateVinCheckDigit(vin: string): VinCheckDigitResult {
    return validateVinCheckDigit(vin);
  }

  decodeWmi(vin: string): WmiDecodeResult {
    return decodeWmi(vin);
  }

  // --- Consultas remotas simuladas (nunca lanzan; ver contrato del puerto) ---

  private async respond(
    partial: Pick<VerificationResult, 'verdict' | 'summary' | 'details'>,
    rawPayload: unknown,
  ): Promise<VerificationResult> {
    await sleep(this.delayMs);
    return {
      ...partial,
      rawPayload,
      provider: this.name,
      checkedAt: new Date().toISOString(),
    };
  }

  private unavailable(source: string): Promise<VerificationResult> {
    return this.respond(
      {
        verdict: 'unavailable',
        summary: `No fue posible consultar ${source} en este momento. Esta fuente NO quedó verificada.`,
        details: { source },
      },
      { simulatedError: 'ECONNRESET', source },
    );
  }

  async checkRepuve(query: RepuveQuery): Promise<VerificationResult> {
    if (this.scenario === 'unavailable') return this.unavailable('REPUVE');
    return this.respond(
      {
        verdict: 'ok',
        summary: 'El vehículo está inscrito en REPUVE y los datos coinciden.',
        details: { vin: query.vin, registered: true },
      },
      { source: 'repuve', vin: query.vin, estatus: 'CON REGISTRO' },
    );
  }

  async checkTheftReport(query: RepuveQuery): Promise<VerificationResult> {
    if (this.scenario === 'unavailable') return this.unavailable('el reporte de robo');
    if (this.scenario === 'stolen') {
      return this.respond(
        {
          verdict: 'fail',
          summary:
            'ALERTA: este NIV tiene reporte de robo vigente. No continúes la operación y repórtalo a las autoridades.',
          details: { vin: query.vin, theftReport: true },
        },
        { source: 'repuve', vin: query.vin, estatus: 'CON REPORTE DE ROBO' },
      );
    }
    return this.respond(
      {
        verdict: 'ok',
        summary: 'Sin reporte de robo en las fuentes consultadas.',
        details: { vin: query.vin, theftReport: false },
      },
      { source: 'repuve', vin: query.vin, estatus: 'SIN REPORTE' },
    );
  }

  async checkDebts(query: DebtsQuery): Promise<VerificationResult> {
    if (this.scenario === 'unavailable') {
      return this.unavailable(`adeudos en ${query.state}`);
    }
    if (this.scenario === 'debts') {
      return this.respond(
        {
          verdict: 'warning',
          summary: `La placa ${query.plate} tiene adeudos de tenencia/multas en ${query.state}. Negocia que se liquiden antes de firmar.`,
          details: { plate: query.plate, state: query.state, debtCents: 748200 },
        },
        {
          source: 'estado',
          placa: query.plate,
          adeudos: [{ concepto: 'TENENCIA 2024', importe: '7482.00' }],
        },
      );
    }
    return this.respond(
      {
        verdict: 'ok',
        summary: `Sin adeudos registrados para la placa ${query.plate} en ${query.state}.`,
        details: { plate: query.plate, state: query.state, debtCents: 0 },
      },
      { source: 'estado', placa: query.plate, adeudos: [] },
    );
  }

  async checkSatCfdi(query: CfdiQuery): Promise<VerificationResult> {
    if (this.scenario === 'unavailable') return this.unavailable('el SAT');
    if (this.scenario === 'fake_invoice') {
      return this.respond(
        {
          verdict: 'fail',
          summary:
            'La factura NO existe ante el SAT o fue cancelada. Puede tratarse de una factura falsificada.',
          details: { uuid: query.uuid, estado: 'No Encontrado' },
        },
        { source: 'sat', uuid: query.uuid, estado: 'No Encontrado' },
      );
    }
    return this.respond(
      {
        verdict: 'ok',
        summary: 'La factura existe ante el SAT y está vigente.',
        details: { uuid: query.uuid, estado: 'Vigente' },
      },
      {
        source: 'sat',
        uuid: query.uuid,
        rfcEmisor: query.rfcEmisor,
        rfcReceptor: query.rfcReceptor,
        estado: 'Vigente',
      },
    );
  }
}
