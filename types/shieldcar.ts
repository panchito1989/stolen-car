/**
 * ShieldCar — Tipos de dominio (Sprint 1: Fase 0 + núcleo Fase 1).
 *
 * Estos tipos son la fuente de verdad del dominio. Las tablas de Supabase
 * (vehicles, transactions, verifications, evidences, audit_log) se derivan
 * de estas formas, y los providers externos SIEMPRE devuelven resultados
 * normalizados a `VerificationResult` para que la capa de persistencia
 * pueda hashear el payload bruto e insertarlo en el audit_log inmutable.
 */

// ---------------------------------------------------------------------------
// Veredictos — el lenguaje visual central del producto (semáforos).
// ---------------------------------------------------------------------------

/**
 * - `ok`          → verde: verificado y limpio.
 * - `warning`     → amarillo: inconsistencia no concluyente o dato informativo.
 * - `fail`        → rojo: evidencia de fraude, robo o documento inválido.
 * - `unavailable` → gris: la fuente no pudo consultarse (transparencia radical:
 *                   siempre decimos qué NO se pudo verificar).
 */
export type Verdict = 'ok' | 'warning' | 'fail' | 'unavailable';

// ---------------------------------------------------------------------------
// Vehículo
// ---------------------------------------------------------------------------

/** Entidades federativas soportadas para consultas de adeudos (Fase 1). */
export type MexicanState =
  | 'CDMX'
  | 'EDOMEX'
  | 'JALISCO'
  | 'NUEVO_LEON'
  | 'OTRO';

export interface Vehicle {
  id: string;
  /** NIV/VIN normalizado (17 caracteres, mayúsculas, sin I/O/Q). */
  vin: string;
  plate: string | null;
  plateState: MexicanState | null;
  /** Datos decodificados offline del WMI — se llenan sin costo por consulta. */
  brand: string | null;
  model: string | null;
  year: number | null;
  /** Resultado del check digit ISO 3779. `null` = aún no validado. */
  vinCheckDigitOk: boolean | null;
  createdAt: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Verificaciones (el corazón de la Fase 1)
// ---------------------------------------------------------------------------

export type VerificationType =
  | 'vin_check_digit' // offline, gratis
  | 'wmi_decode'      // offline, gratis
  | 'repuve'          // registro público vehicular
  | 'theft_report'    // reporte de robo
  | 'debts'           // adeudos de tenencia / multas (por estado)
  | 'sat_cfdi'        // validación de factura por UUID
  | 'serial_photo'    // Fase 4: foto guiada de seriales
  | 'obd_vin';        // Fase 4: NIV digital leído de la ECU

/**
 * Resultado normalizado que TODO provider debe devolver.
 * `rawPayload` es la respuesta cruda del tercero: la capa de persistencia
 * calcula su SHA-256 y lo encadena en `audit_log` — nunca se descarta.
 */
export interface VerificationResult {
  verdict: Verdict;
  /** Resumen legible en español para mostrar en el semáforo de la UI. */
  summary: string;
  /** Datos estructurados específicos del tipo de verificación. */
  details: Record<string, unknown>;
  /** Respuesta cruda del proveedor — se hashea para el audit_log. */
  rawPayload: unknown;
  /** Nombre del adaptador que produjo el resultado (ej. 'mock', 'nubarium'). */
  provider: string;
  checkedAt: string; // ISO 8601
}

/** Fila persistida en la tabla `verifications`. */
export interface Verification {
  id: string;
  transactionId: string;
  type: VerificationType;
  provider: string;
  /** SHA-256 del request enviado al proveedor (reproducibilidad probatoria). */
  requestPayloadHash: string;
  result: VerificationResult;
  /** Denormalizado de `result.verdict` para consultas rápidas por semáforo. */
  verdict: Verdict;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Expediente (Transaction) — máquina de estados explícita
// ---------------------------------------------------------------------------

export type TransactionStatus =
  | 'draft'
  | 'seller_verified'
  | 'vehicle_registered'
  | 'vehicle_verified'
  | 'buyer_joined'
  | 'buyer_verified'
  | 'contract_generated'
  | 'signing'
  | 'signed'
  | 'certified' // constancia NOM-151 emitida
  | 'closed'
  // Ramas terminales / de excepción:
  | 'flagged'   // una verificación salió en rojo — expediente congelado
  | 'cancelled'
  | 'expired';

/**
 * Transiciones permitidas de la máquina de estados del expediente.
 * Cualquier transición fuera de este mapa es un bug o un intento de
 * manipulación — se rechaza y se registra en el audit_log.
 */
export const TRANSACTION_TRANSITIONS: Record<
  TransactionStatus,
  readonly TransactionStatus[]
> = {
  draft: ['seller_verified', 'cancelled', 'expired'],
  seller_verified: ['vehicle_registered', 'cancelled', 'expired'],
  vehicle_registered: ['vehicle_verified', 'flagged', 'cancelled', 'expired'],
  vehicle_verified: ['buyer_joined', 'flagged', 'cancelled', 'expired'],
  buyer_joined: ['buyer_verified', 'flagged', 'cancelled', 'expired'],
  buyer_verified: ['contract_generated', 'flagged', 'cancelled', 'expired'],
  contract_generated: ['signing', 'flagged', 'cancelled', 'expired'],
  signing: ['signed', 'flagged', 'cancelled', 'expired'],
  signed: ['certified', 'flagged', 'cancelled'],
  certified: ['closed'],
  closed: [],
  flagged: ['cancelled'],
  cancelled: [],
  expired: [],
};

export function canTransition(
  from: TransactionStatus,
  to: TransactionStatus,
): boolean {
  return TRANSACTION_TRANSITIONS[from].includes(to);
}

/** El "Expediente de Transacción": la unidad central del producto. */
export interface Transaction {
  id: string;
  vehicleId: string;
  sellerId: string;
  buyerId: string | null; // null hasta que el comprador se une con el código
  status: TransactionStatus;
  /** Precio pactado en centavos MXN (nunca floats para dinero). */
  priceCents: number | null;
  createdAt: string;
  closedAt: string | null;
}

// ---------------------------------------------------------------------------
// Evidencias
// ---------------------------------------------------------------------------

export type EvidenceKind =
  | 'ine_front'
  | 'ine_back'
  | 'liveness_video'
  | 'circulation_card'
  | 'invoice_pdf'
  | 'serial_chassis_photo'
  | 'serial_engine_photo'
  | 'contract_pdf'
  | 'nom151_certificate'
  | 'report_pdf';

export interface Evidence {
  id: string;
  transactionId: string;
  kind: EvidenceKind;
  /** Ruta en el bucket privado (Supabase Storage) — nunca URL pública. */
  storagePath: string;
  /** SHA-256 del archivo: liga la evidencia física al audit_log. */
  sha256: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Audit log — append-only con encadenamiento de hashes
// ---------------------------------------------------------------------------

/**
 * Cada evento incluye `prevHash` (hash del evento anterior) y `hash`
 * (SHA-256 de este evento incluyendo prevHash). Alterar cualquier fila
 * histórica rompe la cadena completa — eso es lo que le da al expediente
 * valor probatorio ante un Ministerio Público.
 */
export interface AuditLogEntry {
  id: string;
  transactionId: string | null; // null para eventos de sistema/cuenta
  /** Quién generó el evento: user id, 'system', o nombre de un provider. */
  actor: string;
  event: string;
  /** SHA-256 del payload asociado al evento (no el payload en sí). */
  payloadHash: string;
  prevHash: string;
  hash: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Consentimientos (LFPDPPP — bloqueante legal desde Fase 0)
// ---------------------------------------------------------------------------

export type ConsentType = 'privacy' | 'biometric' | 'contract';

export interface Consent {
  id: string;
  userId: string;
  type: ConsentType;
  /** Versión del texto aceptado — el texto exacto se versiona en el repo. */
  version: string;
  grantedAt: string;
  revokedAt: string | null;
}
