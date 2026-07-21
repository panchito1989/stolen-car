-- ============================================================================
-- ShieldCar — Migración 0002: Identidades (KYC) y Certificado Unificado
-- Liga la Fase 1 (vehículo) con la Fase 2 (identidad) en un expediente sellado.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- identities — resultado persistido de cada verificación KYC
-- ----------------------------------------------------------------------------
create table public.identities (
  id                    uuid primary key default gen_random_uuid(),
  -- CURP con estructura oficial (validada además en la app antes de insertar).
  curp                  text not null
                        check (curp ~ '^[A-Z][AEIOUX][A-Z]{2}[0-9]{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z][0-9]$'),
  document_type         text not null,
  status                text not null check (status in ('VERIFIED', 'REJECTED', 'MANUAL_REVIEW')),
  biometric_match_score integer not null check (biometric_match_score between 0 and 100),
  payload_hash          text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at            timestamptz not null default now()
);

create index identities_curp_idx on public.identities (curp, created_at desc);

comment on table public.identities is
  'Dictámenes de identidad (KYC ligero). Historial append: re-verificar agrega filas.';

-- ----------------------------------------------------------------------------
-- certificates — el Certificado Unificado ShieldCar (expediente sellado)
-- ----------------------------------------------------------------------------
create table public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  vehicle_id         uuid not null references public.vehicles (id) on delete restrict,
  seller_identity_id uuid not null references public.identities (id) on delete restrict,
  -- Referencias a los hashes de los dictámenes que se sellaron juntos.
  vehicle_hash       text not null check (vehicle_hash ~ '^[0-9a-f]{64}$'),
  identity_hash      text not null check (identity_hash ~ '^[0-9a-f]{64}$'),
  -- El sello maestro: SHA-256 de (dominio + vehicle_hash + identity_hash + sealed_at).
  master_seal_hash   text not null unique check (master_seal_hash ~ '^[0-9a-f]{64}$'),
  status             text not null default 'DRAFT'
                     check (status in ('DRAFT', 'SEALED', 'VOIDED')),
  sealed_at          timestamptz,
  created_at         timestamptz not null default now(),

  -- Un certificado SEALED debe tener su instante de sellado (el que entró al hash).
  constraint certificates_sealed_needs_timestamp
    check (status <> 'SEALED' or sealed_at is not null)
);

create index certificates_vehicle_id_idx on public.certificates (vehicle_id);

comment on table public.certificates is
  'Certificado Unificado: liga un dictamen vehicular con la identidad del vendedor mediante un sello maestro inmutable.';

-- El master_seal_hash es inmutable una vez sellado: solo se permite anular
-- (VOIDED); jamás re-escribir los hashes o el sello de un certificado.
create or replace function public.certificates_guard_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'SEALED' then
    if new.master_seal_hash is distinct from old.master_seal_hash
       or new.vehicle_hash   is distinct from old.vehicle_hash
       or new.identity_hash  is distinct from old.identity_hash
       or new.sealed_at      is distinct from old.sealed_at then
      raise exception 'Un certificado SEALED es inmutable: solo se permite cambiar el status a VOIDED';
    end if;
  end if;
  return new;
end;
$$;

create trigger certificates_immutability
  before update on public.certificates
  for each row execute function public.certificates_guard_immutability();

-- ----------------------------------------------------------------------------
-- RLS — deny-all por defecto (solo backend con service_role hasta Fase 3)
-- ----------------------------------------------------------------------------
alter table public.identities enable row level security;
alter table public.certificates enable row level security;
