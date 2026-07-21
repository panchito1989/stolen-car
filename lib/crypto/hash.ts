/**
 * ShieldCar — Hashing para el expediente probatorio.
 *
 * Todo payload crudo de un proveedor externo se hashea con SHA-256 antes de
 * registrarse en `audit_log`/`verifications`. `hashPayload` serializa de
 * forma estable (claves ordenadas recursivamente) para que el mismo payload
 * produzca siempre el mismo hash, sin importar el orden en que el proveedor
 * haya emitido las claves JSON.
 *
 * Solo-servidor: usa `node:crypto` (síncrono y sin dependencias). El cliente
 * nunca hashea: los hashes se generan donde se custodian, en el backend.
 */

import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Serialización JSON determinista: ordena claves de objetos recursivamente. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(',')}}`;
}

export function hashPayload(payload: unknown): string {
  return sha256Hex(stableStringify(payload));
}
