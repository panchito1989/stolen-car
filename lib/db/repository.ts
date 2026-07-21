/**
 * ShieldCar — Capa de persistencia (Supabase PostgreSQL).
 *
 * El repositorio habla con la base a través de `DbClient`: un contrato
 * estructural mínimo del subconjunto de PostgREST que usamos. El cliente
 * real de Supabase lo satisface tal cual; las pruebas usan un fake en
 * memoria que implementa la MISMA interfaz, así que un cambio en la forma
 * de consultar rompe la compilación del fake — nunca hay deriva silenciosa
 * entre pruebas y producción.
 *
 * La pieza probatoria es `appendAuditLog`: cada evento toma el `hash` del
 * eslabón anterior como `prev_hash` y produce su propio hash encadenado.
 * Alterar cualquier fila histórica rompe toda la cadena hacia adelante.
 */

import { hashPayload } from '@/lib/crypto/hash';
import type { VehicleReport } from '@/lib/report/build-report';

// ---------------------------------------------------------------------------
// Contrato mínimo de base de datos (PostgREST-compatible)
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

interface SingleResult {
  data: Row | null;
  error: { message: string } | null;
}

interface ManyResult {
  data: Row[] | null;
  error: { message: string } | null;
}

interface DbReturning extends PromiseLike<ManyResult> {
  single(): Promise<SingleResult>;
}

interface DbQuery {
  order(column: string, options: { ascending: boolean }): DbQuery;
  limit(count: number): DbQuery;
  maybeSingle(): Promise<SingleResult>;
}

interface DbTable {
  upsert(values: object, options?: { onConflict?: string }): {
    select(columns?: string): DbReturning;
  };
  insert(values: object | object[]): {
    select(columns?: string): DbReturning;
  };
  select(columns: string): DbQuery;
}

export interface DbClient {
  from(table: string): DbTable;
}

// ---------------------------------------------------------------------------
// Hash-chain
// ---------------------------------------------------------------------------

/** Eslabón cero de la cadena: 64 ceros. */
export const GENESIS_HASH = '0'.repeat(64);

export interface ChainEntry {
  actor: string;
  event: string;
  payloadHash: string;
  createdAt: string; // ISO 8601 — entra al hash y se persiste idéntico
}

export function computeChainedHash(
  prevHash: string,
  entry: ChainEntry,
): string {
  return hashPayload({ prevHash, ...entry });
}

// ---------------------------------------------------------------------------
// audit_log (append-only)
// ---------------------------------------------------------------------------

export interface AuditEventInput {
  actor: string;
  event: string;
  payloadHash: string;
}

export interface AuditLogRow {
  actor: string;
  event: string;
  payload_hash: string;
  prev_hash: string;
  hash: string;
  created_at: string;
}

const MAX_APPEND_ATTEMPTS = 3;

/**
 * Inserta un evento encadenado. La columna `prev_hash` es UNIQUE en la
 * migración: si dos peticiones concurrentes leen el mismo último eslabón,
 * solo una gana; la otra recibe violación de unicidad y reintenta leyendo
 * el nuevo final de la cadena. (En Fase 2 esto se muda a una función
 * Postgres con advisory lock para eliminar los reintentos.)
 */
export async function appendAuditLog(
  db: DbClient,
  input: AuditEventInput,
): Promise<AuditLogRow> {
  let lastError = 'sin intentos';

  for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt++) {
    const last = await db
      .from('audit_log')
      .select('hash')
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) {
      throw new Error(`audit_log: no se pudo leer la cadena: ${last.error.message}`);
    }

    const prevHash =
      typeof last.data?.hash === 'string' ? last.data.hash : GENESIS_HASH;
    const createdAt = new Date().toISOString();
    const row: AuditLogRow = {
      actor: input.actor,
      event: input.event,
      payload_hash: input.payloadHash,
      prev_hash: prevHash,
      hash: computeChainedHash(prevHash, { ...input, createdAt }),
      created_at: createdAt,
    };

    const inserted = await db.from('audit_log').insert(row).select().single();
    if (!inserted.error) {
      return row;
    }
    lastError = inserted.error.message;
    const lostRace = /duplicate|unique/i.test(lastError);
    if (!lostRace) break;
  }

  throw new Error(`audit_log: no se pudo encadenar el evento: ${lastError}`);
}

// ---------------------------------------------------------------------------
// Vehículos y verificaciones
// ---------------------------------------------------------------------------

/** Crea o actualiza el vehículo por VIN y devuelve su id. */
export async function upsertVehicle(
  db: DbClient,
  report: VehicleReport,
): Promise<string> {
  const res = await db
    .from('vehicles')
    .upsert(
      {
        vin: report.vin,
        brand: report.local.wmi.manufacturer,
        year: report.local.wmi.modelYear,
        vin_check_digit_ok: report.local.check.valid,
      },
      { onConflict: 'vin' },
    )
    .select('id')
    .single();

  if (res.error || !res.data || typeof res.data.id !== 'string') {
    throw new Error(
      `vehicles: upsert falló: ${res.error?.message ?? 'sin fila devuelta'}`,
    );
  }
  return res.data.id;
}

/** Inserta el lote de verificaciones del reporte (historial, nunca upsert). */
export async function insertVerifications(
  db: DbClient,
  vehicleId: string,
  report: VehicleReport,
): Promise<void> {
  const rows = report.checks.map((check) => ({
    vehicle_id: vehicleId,
    type: check.type,
    provider: check.result.provider,
    payload_hash: check.payloadHash,
    result: check.result,
    verdict: check.result.verdict,
  }));

  const res = await db.from('verifications').insert(rows).select('id');
  if (res.error) {
    throw new Error(`verifications: insert falló: ${res.error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Orquestación: persistir un Reporte ShieldCar completo
// ---------------------------------------------------------------------------

export interface PersistResult {
  vehicleId: string;
  auditHash: string;
}

export async function persistReport(
  db: DbClient,
  report: VehicleReport,
): Promise<PersistResult> {
  const vehicleId = await upsertVehicle(db, report);
  await insertVerifications(db, vehicleId, report);
  const entry = await appendAuditLog(db, {
    actor: 'system',
    event: 'VEHICLE_REPORT_GENERATED',
    payloadHash: hashPayload(report),
  });
  return { vehicleId, auditHash: entry.hash };
}
