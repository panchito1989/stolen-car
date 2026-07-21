/**
 * ShieldCar — Registro mock de certificados para la Vista Pública.
 *
 * Sin Supabase configurado, /verify/[seal] necesita una fuente que resuelva
 * un sello a su certificado. Los dictámenes incrustan timestamps vivos
 * (generatedAt/checkedAt), así que `hashPayload(reporte)` — y por lo tanto el
 * sello — solo es reproducible si se reutiliza LA MISMA instancia del
 * certificado. Este módulo cachea cada certificado de demo por combinación de
 * escenario y lo comparte entre la página demo (que muestra el sello + QR) y
 * el resolvedor (que lo busca). Así, dentro de un mismo proceso, el QR resuelve
 * de punta a punta offline.
 *
 * En producción, `resolvePublicCertificate` consultará Supabase por
 * master_seal_hash, leyendo el certificado y su resumen público PERSISTIDOS
 * al momento del sellado (nunca recomputados). El registro mock es solo la
 * fuente de verdad en desarrollo.
 */

import {
  buildUnifiedCertificate,
  type UnifiedCertificate,
} from '@/lib/certificate/build-certificate';
import {
  MockIdentityProvider,
  type IdentityScenario,
} from '@/lib/identity/mock-provider';
import { buildReport } from '@/lib/report/build-report';
import type { FullCertificate } from '@/lib/verify/sanitizer';
import type { MockScenario } from '@/lib/providers/vehicle/mock-aggregator';

/** Constantes compartidas con la página demo — no cambiar por separado. */
export const DEMO_VIN = '3N1AB7AP0KY000000';
export const DEMO_SEALED_AT = '2026-07-21T18:00:00.000Z';
/** Timestamp distinto → sello distinto para el certificado revocado de prueba. */
export const DEMO_VOIDED_AT = '2026-07-20T09:00:00.000Z';
/**
 * Reloj fijo para los timestamps INTERNOS de los dictámenes de demo. Es la
 * clave del determinismo: sin esto, cada ruta de Next construiría los reportes
 * con `new Date()` distinto (grafos de módulos por ruta) y el sello no
 * resolvería. Con un `now` fijo, el sello es idéntico en cualquier ruta.
 */
const DEMO_NOW = '2026-07-21T17:59:00.000Z';

const VEHICLE_SCENARIOS: MockScenario[] = [
  'clean',
  'stolen',
  'debts',
  'fake_invoice',
  'unavailable',
];
const IDENTITY_SCENARIOS: IdentityScenario[] = [
  'valid_ine',
  'expired_ine',
  'curp_mismatch',
  'face_mismatch',
  'fake_document',
];

/**
 * Construye un certificado de demo de forma DETERMINISTA: mismo escenario +
 * mismo sealedAt → exactamente el mismo sello, en cualquier ruta y proceso,
 * porque los timestamps internos quedan fijados por `DEMO_NOW`.
 */
async function buildCert(
  vehicleScenario: MockScenario,
  identityScenario: IdentityScenario,
  sealedAt: string,
): Promise<UnifiedCertificate> {
  const vehicleReport = await buildReport({
    vin: DEMO_VIN,
    scenario: vehicleScenario,
    delayMs: 0,
    now: DEMO_NOW,
  });
  const kycReport = await new MockIdentityProvider({
    scenario: identityScenario,
    delayMs: 0,
    now: DEMO_NOW,
  }).verifyIdentity({
    frontImage: 'demo',
    backImage: 'demo',
    selfieFrame: 'demo',
  });
  return buildUnifiedCertificate(vehicleReport, kycReport, sealedAt);
}

/**
 * Certificado de demo para una combinación de escenarios. Lo usa la página
 * demo; comparte instancia (y por tanto sello) con el resolvedor público.
 */
export async function getDemoCertificate(
  vehicleScenario: MockScenario,
  identityScenario: IdentityScenario,
): Promise<FullCertificate> {
  const cert = await buildCert(vehicleScenario, identityScenario, DEMO_SEALED_AT);
  return { ...cert, status: 'SEALED' };
}

let registryPromise: Promise<Map<string, FullCertificate>> | null = null;

async function buildRegistry(): Promise<Map<string, FullCertificate>> {
  const map = new Map<string, FullCertificate>();

  for (const v of VEHICLE_SCENARIOS) {
    for (const i of IDENTITY_SCENARIOS) {
      const cert = await getDemoCertificate(v, i);
      map.set(cert.masterSealHash, cert);
    }
  }

  // Certificado REVOCADO de prueba (clean + valid_ine con otro timestamp →
  // sello distinto del sellado).
  const voidedBase = await buildCert('clean', 'valid_ine', DEMO_VOIDED_AT);
  map.set(voidedBase.masterSealHash, { ...voidedBase, status: 'VOIDED' });

  return map;
}

/** Sello canónico de la demo (clean + valid_ine). */
export async function demoSealHash(): Promise<string> {
  return (await getDemoCertificate('clean', 'valid_ine')).masterSealHash;
}

/** Sello del certificado revocado de prueba. */
export async function voidedDemoSealHash(): Promise<string> {
  return (await buildCert('clean', 'valid_ine', DEMO_VOIDED_AT)).masterSealHash;
}

/**
 * Resuelve un sello a su certificado. Hoy usa el registro mock; en producción
 * antepondrá una consulta a Supabase por master_seal_hash.
 */
export async function resolvePublicCertificate(
  seal: string,
): Promise<FullCertificate | null> {
  if (!/^[0-9a-f]{64}$/.test(seal)) return null;
  registryPromise ??= buildRegistry();
  const registry = await registryPromise;
  return registry.get(seal) ?? null;
}
