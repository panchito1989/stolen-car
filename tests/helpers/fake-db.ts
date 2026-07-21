/**
 * Fake en memoria del subconjunto de PostgREST que usan los repositorios.
 * Implementa `DbClient`, así que si un repositorio cambia su forma de
 * consultar, este fake deja de compilar — el contrato se mantiene honesto.
 */

import type { DbClient } from '@/lib/db/repository';

export type Row = Record<string, unknown>;

interface QueryError {
  message: string;
}

/** Construye el objeto "thenable + single()" que devuelve PostgREST. */
function returning(data: Row[], error: QueryError | null = null) {
  const many = Promise.resolve({ data: error ? null : data, error });
  return {
    then: many.then.bind(many),
    single: async () => ({
      data: error ? null : (data[0] ?? null),
      error,
    }),
  };
}

export class FakeDb implements DbClient {
  tables: {
    vehicles: Row[];
    verifications: Row[];
    audit_log: Row[];
    identities: Row[];
    certificates: Row[];
  } = {
    vehicles: [],
    verifications: [],
    audit_log: [],
    identities: [],
    certificates: [],
  };
  /** Simula N violaciones de unicidad consecutivas al insertar en audit_log. */
  failAuditInserts = 0;
  private seq = 0;
  private uid = 0;

  from(table: string) {
    const rows = () => {
      const t = (this.tables as unknown as Record<string, Row[] | undefined>)[
        table
      ];
      if (!t) throw new Error(`tabla desconocida: ${table}`);
      return t;
    };

    return {
      upsert: (values: object, options?: { onConflict?: string }) => {
        const key = options?.onConflict ?? 'id';
        const incoming = values as Row;
        const existing = rows().find((r) => r[key] === incoming[key]);
        let row: Row;
        if (existing) {
          Object.assign(existing, incoming);
          row = existing;
        } else {
          row = { id: `uuid-${++this.uid}`, ...incoming };
          rows().push(row);
        }
        return { select: (_cols?: string) => returning([row]) };
      },

      insert: (values: object | object[]) => {
        const list = (Array.isArray(values) ? values : [values]) as Row[];
        if (table === 'audit_log' && this.failAuditInserts > 0) {
          this.failAuditInserts--;
          return {
            select: (_cols?: string) =>
              returning([], {
                message:
                  'duplicate key value violates unique constraint "audit_log_prev_hash_key"',
              }),
          };
        }
        const inserted = list.map((v) => {
          const row: Row = { id: `uuid-${++this.uid}`, seq: ++this.seq, ...v };
          rows().push(row);
          return row;
        });
        return { select: (_cols?: string) => returning(inserted) };
      },

      select: (_cols: string) => {
        let result = [...rows()];
        const query = {
          order: (column: string, opts: { ascending: boolean }) => {
            result.sort((a, b) => {
              const x = a[column] as number;
              const y = b[column] as number;
              return opts.ascending ? x - y : y - x;
            });
            return query;
          },
          limit: (n: number) => {
            result = result.slice(0, n);
            return query;
          },
          maybeSingle: async () => ({
            data: result[0] ?? null,
            error: null,
          }),
        };
        return query;
      },
    };
  }
}
