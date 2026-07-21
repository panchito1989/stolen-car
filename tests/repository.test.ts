import { describe, expect, test } from 'vitest';
import {
  GENESIS_HASH,
  appendAuditLog,
  computeChainedHash,
  persistReport,
} from '@/lib/db/repository';
import { buildReport } from '@/lib/report/build-report';
import { FakeDb } from './helpers/fake-db';

const VALID_VIN = '3N1AB7AP0KY000000';

// ---------------------------------------------------------------------------
// computeChainedHash
// ---------------------------------------------------------------------------

describe('computeChainedHash', () => {
  const entry = {
    actor: 'system',
    event: 'VEHICLE_REPORT_GENERATED',
    payloadHash: 'a'.repeat(64),
    createdAt: '2026-07-21T12:00:00.000Z',
  };

  test('returns 64 hex chars and is deterministic', () => {
    const h1 = computeChainedHash(GENESIS_HASH, entry);
    const h2 = computeChainedHash(GENESIS_HASH, entry);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
  });

  test('changing the previous hash changes the chained hash', () => {
    const h1 = computeChainedHash(GENESIS_HASH, entry);
    const h2 = computeChainedHash('b'.repeat(64), entry);
    expect(h1).not.toBe(h2);
  });

  test('changing any field of the entry changes the chained hash', () => {
    const h1 = computeChainedHash(GENESIS_HASH, entry);
    const h2 = computeChainedHash(GENESIS_HASH, {
      ...entry,
      event: 'OTHER_EVENT',
    });
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// appendAuditLog — la cadena inmutable
// ---------------------------------------------------------------------------

describe('appendAuditLog', () => {
  const input = {
    actor: 'system',
    event: 'VEHICLE_REPORT_GENERATED',
    payloadHash: 'c'.repeat(64),
  };

  test('the first event chains from the genesis hash', async () => {
    const db = new FakeDb();
    const entry = await appendAuditLog(db, input);
    expect(entry.prev_hash).toBe(GENESIS_HASH);
    expect(entry.hash).toBe(
      computeChainedHash(GENESIS_HASH, {
        ...input,
        createdAt: entry.created_at,
      }),
    );
  });

  test('each event chains from the previous one', async () => {
    const db = new FakeDb();
    const first = await appendAuditLog(db, input);
    const second = await appendAuditLog(db, {
      ...input,
      event: 'SECOND_EVENT',
    });
    expect(second.prev_hash).toBe(first.hash);
    expect(second.hash).not.toBe(first.hash);
  });

  test('retries when a concurrent append wins the race (unique violation)', async () => {
    const db = new FakeDb();
    await appendAuditLog(db, input);
    db.failAuditInserts = 1; // primer intento pierde la carrera
    const entry = await appendAuditLog(db, { ...input, event: 'RACED_EVENT' });
    expect(entry.event).toBe('RACED_EVENT');
    expect(db.tables.audit_log).toHaveLength(2);
  });

  test('gives up after exhausting retries', async () => {
    const db = new FakeDb();
    db.failAuditInserts = 99;
    await expect(appendAuditLog(db, input)).rejects.toThrow(/duplicate/);
  });
});

// ---------------------------------------------------------------------------
// persistReport — orquestación completa
// ---------------------------------------------------------------------------

describe('persistReport', () => {
  test('persists vehicle, verifications and one chained audit event', async () => {
    const db = new FakeDb();
    const report = await buildReport({
      vin: VALID_VIN,
      scenario: 'clean',
      delayMs: 0,
    });

    const result = await persistReport(db, report);

    expect(db.tables.vehicles).toHaveLength(1);
    expect(db.tables.vehicles[0]?.vin).toBe(VALID_VIN);
    expect(db.tables.vehicles[0]?.vin_check_digit_ok).toBe(true);

    expect(db.tables.verifications).toHaveLength(4);
    for (const v of db.tables.verifications) {
      expect(v.vehicle_id).toBe(db.tables.vehicles[0]?.id);
      expect(v.verdict).toBe('ok');
      expect(v.payload_hash).toMatch(/^[0-9a-f]{64}$/);
    }

    expect(db.tables.audit_log).toHaveLength(1);
    expect(db.tables.audit_log[0]?.event).toBe('VEHICLE_REPORT_GENERATED');
    expect(result.vehicleId).toBe(db.tables.vehicles[0]?.id);
    expect(result.auditHash).toBe(db.tables.audit_log[0]?.hash);
  });

  test('re-persisting the same VIN upserts the vehicle instead of duplicating', async () => {
    const db = new FakeDb();
    const report = await buildReport({
      vin: VALID_VIN,
      scenario: 'clean',
      delayMs: 0,
    });
    await persistReport(db, report);
    await persistReport(db, report);

    expect(db.tables.vehicles).toHaveLength(1);
    expect(db.tables.verifications).toHaveLength(8); // historial completo
    expect(db.tables.audit_log).toHaveLength(2); // cadena de 2 eslabones
    expect(db.tables.audit_log[1]?.prev_hash).toBe(
      db.tables.audit_log[0]?.hash,
    );
  });
});
