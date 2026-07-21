-- ============================================================================
-- ShieldCar — Migración inicial (Fase 1: Reporte Vehicular)
-- Tablas: vehicles, verifications, audit_log (append-only con hash-chain)
-- ============================================================================

-- gen_random_uuid() es nativo desde PostgreSQL 13, pero dejamos la extensión
-- explícita por claridad y compatibilidad.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- vehicles
-- ----------------------------------------------------------------------------
create table public.vehicles (
  id                 uuid primary key default gen_random_uuid(),
  vin                text not null unique
                     check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  plate              text,
  plate_state        text,
  brand              text,
  model              text,
  year               integer check (year between 1900 and 2100),
  vin_check_digit_ok boolean,
  created_at         timestamptz not null default now()
);

comment on table public.vehicles is
  'Vehículos identificados por NIV. El NIV se guarda ya normalizado (17 chars, sin I/O/Q).';

-- ----------------------------------------------------------------------------
-- verifications — historial completo, una fila por consulta (nunca se pisa)
-- ----------------------------------------------------------------------------
create table public.verifications (
  id                   uuid primary key default gen_random_uuid(),
  vehicle_id           uuid not null references public.vehicles (id) on delete cascade,
  type                 text not null check (type in (
                         'vin_check_digit', 'wmi_decode', 'repuve',
                         'theft_report', 'debts', 'sat_cfdi',
                         'serial_photo', 'obd_vin'
                       )),
  provider             text not null,
  -- SHA-256 del request enviado al proveedor (reproducibilidad; se llena
  -- cuando entren los agregadores reales).
  request_payload_hash text check (request_payload_hash ~ '^[0-9a-f]{64}$'),
  -- SHA-256 de la respuesta cruda del proveedor (ver ReportCheck.payloadHash).
  payload_hash         text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result               jsonb not null,
  verdict              text not null check (verdict in ('ok', 'warning', 'fail', 'unavailable')),
  created_at           timestamptz not null default now()
);

create index verifications_vehicle_id_idx on public.verifications (vehicle_id, created_at desc);

comment on table public.verifications is
  'Resultado normalizado de cada consulta a una fuente. Historial append por diseño: re-verificar un vehículo agrega filas, no las reemplaza.';

-- ----------------------------------------------------------------------------
-- audit_log — append-only con encadenamiento de hashes
-- ----------------------------------------------------------------------------
create table public.audit_log (
  -- seq da el orden total de la cadena (los uuid no ordenan).
  seq          bigint generated always as identity primary key,
  id           uuid not null default gen_random_uuid(),
  actor        text not null,
  event        text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  prev_hash    text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash         text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),

  -- La cadena no puede bifurcarse: cada eslabón tiene a lo más un sucesor.
  -- Dos appends concurrentes con el mismo prev_hash → uno falla y reintenta
  -- (ver appendAuditLog en lib/db/repository.ts).
  constraint audit_log_prev_hash_key unique (prev_hash),
  constraint audit_log_hash_key unique (hash)
);

comment on table public.audit_log is
  'Bitácora probatoria append-only. Cada evento incluye el hash del anterior; alterar una fila histórica rompe la cadena completa.';

-- Candado append-only: ni UPDATE ni DELETE, ni siquiera con service_role.
create or replace function public.audit_log_forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log es append-only: % no está permitido', tg_op;
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_forbid_mutation();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
-- RLS habilitado SIN políticas permisivas: por defecto nadie (anon ni
-- authenticated) puede leer o escribir. Hoy solo el backend escribe usando
-- la service_role key (que salta RLS). Las políticas por usuario llegarán
-- con la Fase 2 (KYC/cuentas), cuando exista ownership real de expedientes.
alter table public.vehicles enable row level security;
alter table public.verifications enable row level security;
alter table public.audit_log enable row level security;
