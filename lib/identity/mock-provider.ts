/**
 * ShieldCar — Adaptador mock del puerto `IdentityProvider`.
 *
 * Simula OCR de INE + comparación facial con escenarios deterministas para
 * construir y probar toda la UI del KYC antes de contratar un proveedor
 * real (Nubarium/MetaMap). Mismo patrón que MockVehicleProvider: el
 * adaptador real se enchufa después sin tocar dominio ni UI.
 */

import type {
  IdentityProvider,
  IneData,
  KycCaptureInput,
  KycReport,
} from '@/lib/identity/types';
import {
  decideKycVerdict,
  validateClaveElector,
  validateCurp,
} from '@/lib/identity/validators';

export type IdentityScenario =
  | 'valid_ine'
  | 'expired_ine'
  | 'curp_mismatch'
  | 'face_mismatch'
  | 'fake_document';

export interface MockIdentityProviderOptions {
  scenario?: IdentityScenario;
  /** Latencia simulada. Default 300 ms; usar 0 en pruebas. */
  delayMs?: number;
  /**
   * Reloj fijo (ISO 8601) para `generatedAt` y el cálculo de vigencia. Los
   * flujos deterministas (demo/registro público) lo pasan para que el
   * dictamen hashee idéntico entre construcciones. Default: la hora real.
   */
  now?: string;
}

function sleep(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();
}

/** Persona ficticia base (CURP con dígito verificador real). */
const BASE_INE: IneData = {
  curp: 'PEGJ850315HDFLRN05',
  claveElector: 'PLGRJN85031509H100',
  nombre: 'JUAN',
  primerApellido: 'PEREZ',
  segundoApellido: 'GALINDO',
  fechaNacimiento: '1985-03-15',
  sexo: 'H',
  vigencia: 2031,
  modelo: 'H',
  cic: '198306754',
  ocr: null,
  entidad: 'DF',
};

export class MockIdentityProvider implements IdentityProvider {
  readonly name = 'mock-identity';

  private readonly scenario: IdentityScenario;
  private readonly delayMs: number;
  private readonly now: string | undefined;

  constructor(options: MockIdentityProviderOptions = {}) {
    this.scenario = options.scenario ?? 'valid_ine';
    this.delayMs = options.delayMs ?? 300;
    this.now = options.now;
  }

  async verifyIdentity(_input: KycCaptureInput): Promise<KycReport> {
    await sleep(this.delayMs);
    const clock = this.now ? new Date(this.now) : new Date();

    // 1) "OCR": la INE que el escenario dicta.
    const ine: IneData = { ...BASE_INE };
    let documentIntact = true;

    switch (this.scenario) {
      case 'expired_ine':
        ine.vigencia = 2023;
        break;
      case 'curp_mismatch':
        // Dígito verificador corrompido: el OCR "leyó" una CURP que no cuadra
        // con el resto del documento.
        ine.curp = 'PEGJ850315HDFLRN09';
        break;
      case 'fake_document':
        documentIntact = false;
        break;
      case 'valid_ine':
      case 'face_mismatch':
        break;
    }

    // 2) "Biometría": comparación facial + prueba de vida.
    const biometric =
      this.scenario === 'face_mismatch'
        ? { faceMatchScore: 31, livenessPassed: true, livenessScore: 92 }
        : { faceMatchScore: 97, livenessPassed: true, livenessScore: 96 };

    // 3) Los checks pasan por los MISMOS validadores locales que usará el
    //    proveedor real — el mock no inventa veredictos, los deriva.
    const checks = {
      curpValid: validateCurp(ine.curp).valid,
      claveElectorValid: validateClaveElector(ine.claveElector).valid,
      vigente: ine.vigencia >= clock.getFullYear(),
      documentIntact,
      faceMatchScore: biometric.faceMatchScore,
      livenessPassed: biometric.livenessPassed,
    };

    const decision = decideKycVerdict(checks);

    return {
      provider: this.name,
      generatedAt: clock.toISOString(),
      ine,
      biometric,
      checks,
      verdict: decision.verdict,
      reasons: decision.reasons,
    };
  }
}
