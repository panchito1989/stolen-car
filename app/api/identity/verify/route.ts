/**
 * POST /api/identity/verify
 *
 * Body: {
 *   frontImage: string;   // Base64 o referencia a storage
 *   backImage: string;
 *   selfieFrame: string;
 *   scenario?: IdentityScenario;  // solo demo/desarrollo
 * }
 *
 * Procesa el KYC con `MockIdentityProvider`, calcula la huella SHA-256
 * estable del dictamen y registra `KYC_VERIFICATION_COMPLETED` en el
 * audit_log (o lo deja constar en consola si Supabase está offline).
 */

import { NextResponse } from 'next/server';
import { hashPayload } from '@/lib/crypto/hash';
import { appendAuditLog } from '@/lib/db/repository';
import { getServerDb } from '@/lib/db/supabase-server';
import {
  MockIdentityProvider,
  type IdentityScenario,
} from '@/lib/identity/mock-provider';

const SCENARIOS: readonly IdentityScenario[] = [
  'valid_ine',
  'expired_ine',
  'curp_mismatch',
  'face_mismatch',
  'fake_document',
];

function isScenario(value: unknown): value is IdentityScenario {
  return (
    typeof value === 'string' && SCENARIOS.includes(value as IdentityScenario)
  );
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

  const { frontImage, backImage, selfieFrame, scenario } = (body ?? {}) as {
    frontImage?: unknown;
    backImage?: unknown;
    selfieFrame?: unknown;
    scenario?: unknown;
  };

  for (const [field, value] of Object.entries({
    frontImage,
    backImage,
    selfieFrame,
  })) {
    if (typeof value !== 'string' || value.length === 0) {
      return NextResponse.json(
        { error: `Falta la captura \`${field}\`.` },
        { status: 400 },
      );
    }
  }
  if (scenario !== undefined && !isScenario(scenario)) {
    return NextResponse.json(
      { error: `Escenario inválido. Usa uno de: ${SCENARIOS.join(', ')}.` },
      { status: 400 },
    );
  }

  const provider = new MockIdentityProvider({
    scenario: scenario ?? 'valid_ine',
    delayMs: 1100, // simula OCR + biometría reales
  });

  const report = await provider.verifyIdentity({
    frontImage: frontImage as string,
    backImage: backImage as string,
    selfieFrame: selfieFrame as string,
  });

  // Huella probatoria del dictamen completo (SHA-256 estable de Fase 1).
  const payloadHash = hashPayload(report);

  // Registro forense con la misma resiliencia que el reporte vehicular.
  let audit: { recorded: boolean; auditHash?: string } = { recorded: false };
  const db = getServerDb();
  if (db) {
    try {
      const entry = await appendAuditLog(db, {
        actor: 'system',
        event: 'KYC_VERIFICATION_COMPLETED',
        payloadHash,
      });
      audit = { recorded: true, auditHash: entry.hash };
    } catch (auditError) {
      console.warn(
        '[ShieldCar] El KYC se generó pero no pudo auditarse en Supabase:',
        auditError instanceof Error ? auditError.message : auditError,
      );
    }
  } else {
    console.info(
      `[ShieldCar] (offline) KYC_VERIFICATION_COMPLETED verdict=${report.verdict} payloadHash=${payloadHash}`,
    );
  }

  return NextResponse.json({ ...report, payloadHash, audit });
}
