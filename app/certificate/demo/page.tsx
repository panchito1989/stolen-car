/**
 * Vista de demostración del Certificado Unificado.
 *
 * Server component: instancia los dos mocks (Fase 1 y Fase 2), corre ambos
 * dictámenes en memoria, ensambla el certificado con su sello maestro y
 * renderiza la tarjeta. Permite auditar visualmente cualquier combinación
 * vía query params, p.ej. /certificate/demo?vehicle=stolen&identity=face_mismatch
 */

import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import UnifiedCertificateCard from '@/components/certificate/UnifiedCertificateCard';
import { buildUnifiedCertificate } from '@/lib/certificate/build-certificate';
import {
  MockIdentityProvider,
  type IdentityScenario,
} from '@/lib/identity/mock-provider';
import type { MockScenario } from '@/lib/providers/vehicle/mock-aggregator';
import { buildReport } from '@/lib/report/build-report';

export const metadata = {
  title: 'ShieldCar — Certificado Unificado (demo)',
};

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

const DEMO_VIN = '3N1AB7AP0KY000000';

function pick<T extends string>(
  value: string | undefined,
  allowed: T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export default async function CertificateDemoPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicle?: string; identity?: string }>;
}) {
  const params = await searchParams;
  const vehicleScenario = pick(params.vehicle, VEHICLE_SCENARIOS, 'clean');
  const identityScenario = pick(params.identity, IDENTITY_SCENARIOS, 'valid_ine');

  // Ambos dictámenes en memoria (sin red, sin base).
  const vehicleReport = await buildReport({
    vin: DEMO_VIN,
    scenario: vehicleScenario,
    delayMs: 0,
  });
  const kycReport = await new MockIdentityProvider({
    scenario: identityScenario,
    delayMs: 0,
  }).verifyIdentity({ frontImage: 'demo', backImage: 'demo', selfieFrame: 'demo' });

  // Sello fijo por combinación → la demo es estable al recargar.
  const sealedAt = '2026-07-21T18:00:00.000Z';
  const certificate = buildUnifiedCertificate(vehicleReport, kycReport, sealedAt);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-10 pt-6">
      <header className="border-b-4 border-ink pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-8" strokeWidth={2.25} aria-hidden />
          <span className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
            ShieldCar
          </span>
        </div>
        <p className="mt-2 font-display text-sm font-semibold uppercase tracking-[0.25em] text-gris">
          Certificado Unificado · Demo
        </p>
      </header>

      <div className="mt-4">
        <Link
          href="/"
          className="flex items-center gap-1 font-display text-xs font-bold uppercase tracking-wider text-gris underline-offset-2 hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Volver
        </Link>
      </div>

      {/* Selectores de escenario (navegación por links = server-only) */}
      <div className="mt-5 space-y-3">
        <ScenarioRow
          label="Vehículo"
          param="vehicle"
          current={vehicleScenario}
          other={identityScenario}
          otherParam="identity"
          options={VEHICLE_SCENARIOS}
        />
        <ScenarioRow
          label="Identidad"
          param="identity"
          current={identityScenario}
          other={vehicleScenario}
          otherParam="vehicle"
          options={IDENTITY_SCENARIOS}
        />
      </div>

      <div className="mt-6">
        <UnifiedCertificateCard certificate={certificate} />
      </div>

      <footer className="mt-auto pt-10">
        <p className="border-t border-ink/20 pt-3 text-center font-mono text-[0.6rem] uppercase tracking-widest text-gris">
          Vista de demostración · datos simulados (mocks)
        </p>
      </footer>
    </main>
  );
}

function ScenarioRow({
  label,
  param,
  current,
  other,
  otherParam,
  options,
}: {
  label: string;
  param: string;
  current: string;
  other: string;
  otherParam: string;
  options: string[];
}) {
  return (
    <div>
      <p className="font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gris">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt === current;
          const query = new URLSearchParams({
            [param]: opt,
            [otherParam]: other,
          }).toString();
          return (
            <Link
              key={opt}
              href={`/certificate/demo?${query}`}
              className={`hard-shadow-sm border-2 px-2 py-1 font-mono text-[0.65rem] uppercase ${
                active
                  ? 'border-ink bg-ink text-paper'
                  : 'border-ink/40 bg-card text-gris'
              }`}
            >
              {opt}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
