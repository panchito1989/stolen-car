/**
 * POST /api/vehicle/report
 *
 * Body: { vin: string; scenario?: MockScenario }
 *
 * Ejecuta el pipeline del Reporte ShieldCar contra el `MockVehicleProvider`.
 * El parámetro `scenario` existe SOLO para auditar la UI en desarrollo;
 * cuando entre el agregador real, el provider se resuelve por configuración
 * y este parámetro desaparece de la superficie pública.
 */

import { NextResponse } from 'next/server';
import { persistReport } from '@/lib/db/repository';
import { getServerDb } from '@/lib/db/supabase-server';
import { buildReport } from '@/lib/report/build-report';
import type { MockScenario } from '@/lib/providers/vehicle/mock-aggregator';

const SCENARIOS: readonly MockScenario[] = [
  'clean',
  'stolen',
  'debts',
  'fake_invoice',
  'unavailable',
];

function isScenario(value: unknown): value is MockScenario {
  return typeof value === 'string' && SCENARIOS.includes(value as MockScenario);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'El cuerpo de la petición debe ser JSON.' },
      { status: 400 },
    );
  }

  const { vin, scenario } = (body ?? {}) as {
    vin?: unknown;
    scenario?: unknown;
  };

  if (typeof vin !== 'string' || vin.length === 0) {
    return NextResponse.json(
      { error: 'Falta el campo `vin`.' },
      { status: 400 },
    );
  }
  if (scenario !== undefined && !isScenario(scenario)) {
    return NextResponse.json(
      { error: `Escenario inválido. Usa uno de: ${SCENARIOS.join(', ')}.` },
      { status: 400 },
    );
  }

  try {
    // Latencia simulada perceptible para que el estado de carga sea real.
    const report = await buildReport({
      vin,
      scenario: scenario ?? 'clean',
      delayMs: 900,
    });

    // Persistencia con resiliencia: sin Supabase configurado (o si falla),
    // se advierte en consola y el reporte se devuelve igual — el desarrollo
    // local offline nunca se rompe.
    let persistence: { persisted: boolean; auditHash?: string } = {
      persisted: false,
    };
    const db = getServerDb();
    if (db) {
      try {
        const saved = await persistReport(db, report);
        persistence = { persisted: true, auditHash: saved.auditHash };
      } catch (persistError) {
        console.warn(
          '[ShieldCar] El reporte se generó pero no pudo persistirse:',
          persistError instanceof Error
            ? persistError.message
            : persistError,
        );
      }
    }

    return NextResponse.json({ ...report, persistence });
  } catch (error) {
    // `buildReport` solo lanza por NIV inválido (error del cliente).
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'NIV inválido.' },
      { status: 400 },
    );
  }
}
