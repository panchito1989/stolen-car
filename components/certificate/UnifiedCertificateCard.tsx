/**
 * ShieldCar — Dictamen Unificado (Certificado ShieldCar).
 *
 * Componente pericial que empareja el dictamen del vehículo (Fase 1) con el
 * de la identidad del vendedor (Fase 2) y los cierra con el sello maestro.
 * En móvil las dos secciones se apilan; en pantallas anchas van a dos
 * columnas. Server component puro (sin estado): recibe el viewmodel ya
 * ensamblado por `buildUnifiedCertificate`.
 */

import {
  BadgeCheck,
  Car,
  Fingerprint,
  Lock,
  OctagonAlert,
  QrCode,
  ShieldCheck,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { maskVin, type UnifiedCertificate } from '@/lib/certificate/build-certificate';
import {
  KYC_VERDICT_TO_SEMAPHORE,
  type KycVerdictCode,
} from '@/lib/identity/types';
import type { Verdict } from '@/types/shieldcar';

const SEMAPHORE_BOX: Record<Verdict, string> = {
  ok: 'border-verde bg-verde-bg text-verde',
  warning: 'border-ambar bg-ambar-bg text-ambar',
  fail: 'border-rojo bg-rojo-bg text-rojo',
  unavailable: 'border-gris bg-card text-gris',
};

function SemaphoreIcon({ verdict, className }: { verdict: Verdict; className?: string }) {
  const Icon =
    verdict === 'ok' ? BadgeCheck : verdict === 'fail' ? OctagonAlert : TriangleAlert;
  return <Icon className={className} strokeWidth={2.25} aria-hidden />;
}

const KYC_LABEL: Record<KycVerdictCode, string> = {
  VERIFIED: 'Vendedor verificado',
  MANUAL_REVIEW: 'Requiere revisión',
  REJECTED: 'Identidad rechazada',
};

export default function UnifiedCertificateCard({
  certificate,
}: {
  certificate: UnifiedCertificate;
}) {
  const { vehicleReport, kycReport, masterSealHash, sealedAt } = certificate;
  const kycSemaphore = KYC_VERDICT_TO_SEMAPHORE[kycReport.verdict];
  const fullName =
    `${kycReport.ine.nombre} ${kycReport.ine.primerApellido} ${kycReport.ine.segundoApellido ?? ''}`.trim();

  return (
    <article className="hard-shadow border-2 border-ink bg-card">
      {/* Membrete */}
      <header className="flex items-center justify-between border-b-2 border-ink px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6" strokeWidth={2.25} aria-hidden />
          <span className="font-display text-lg font-bold uppercase tracking-tight">
            Certificado ShieldCar
          </span>
        </div>
        <time
          dateTime={sealedAt}
          className="font-mono text-[0.6rem] text-gris"
        >
          {new Date(sealedAt).toLocaleString('es-MX', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </time>
      </header>

      {/* Dos secciones: vehículo + identidad */}
      <div className="grid gap-px bg-ink/15 sm:grid-cols-2">
        {/* --- Sección vehicular --- */}
        <section className="bg-card p-4">
          <h3 className="flex items-center gap-1.5 font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris">
            <Car className="size-4" aria-hidden />
            Vehículo
          </h3>

          <div
            className={`mt-3 flex items-center gap-2 border-2 px-3 py-2 ${SEMAPHORE_BOX[vehicleReport.global.verdict]}`}
          >
            <SemaphoreIcon
              verdict={vehicleReport.global.verdict}
              className="size-6"
            />
            <span className="font-display text-lg font-bold uppercase leading-none tracking-wide">
              {vehicleReport.global.label}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Field
              label="Marca"
              value={vehicleReport.local.wmi.manufacturer ?? 'No catalogado'}
            />
            <Field
              label="Año"
              value={
                vehicleReport.local.wmi.modelYear
                  ? String(vehicleReport.local.wmi.modelYear)
                  : '—'
              }
            />
            <div className="col-span-2">
              <Field label="NIV (enmascarado)" value={maskVin(vehicleReport.vin)} mono />
            </div>
          </dl>
        </section>

        {/* --- Sección identidad --- */}
        <section className="bg-card p-4">
          <h3 className="flex items-center gap-1.5 font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris">
            <UserRound className="size-4" aria-hidden />
            Vendedor
          </h3>

          <div
            className={`mt-3 flex items-center gap-2 border-2 px-3 py-2 ${SEMAPHORE_BOX[kycSemaphore]}`}
          >
            <SemaphoreIcon verdict={kycSemaphore} className="size-6" />
            <span className="font-display text-lg font-bold uppercase leading-none tracking-wide">
              {KYC_LABEL[kycReport.verdict]}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div className="col-span-2">
              <Field label="Nombre" value={fullName} />
            </div>
            <div className="col-span-2">
              <Field
                label="CURP verificado"
                value={kycReport.ine.curp}
                mono
                ok={kycReport.checks.curpValid}
              />
            </div>
            <Field
              label="Biometría"
              value={`${kycReport.biometric.faceMatchScore}%`}
            />
            <Field
              label="INE"
              value={kycReport.checks.vigente ? 'Vigente' : 'Vencida'}
              alert={!kycReport.checks.vigente}
            />
          </dl>
        </section>
      </div>

      {/* Bloque de sellado forense */}
      <section className="border-t-2 border-ink bg-ink px-4 py-4 text-paper">
        <div className="flex items-center gap-4">
          {/* Placeholder de QR de verificación pública */}
          <div
            className="grid size-20 shrink-0 place-items-center border-2 border-paper/40 bg-paper/5"
            aria-label="Código QR de verificación (pendiente)"
          >
            <QrCode className="size-12 text-paper/70" strokeWidth={1.25} aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Lock className="size-4 text-verde" aria-hidden />
              <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-paper">
                Expediente blindado e inmutable
              </span>
            </div>
            <p className="mt-1 font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-paper/50">
              Sello maestro (SHA-256)
            </p>
            <p className="mt-0.5 break-all font-mono text-[0.7rem] leading-tight text-paper">
              {masterSealHash}
            </p>
          </div>
        </div>

        <p className="mt-3 border-t border-paper/20 pt-2 font-mono text-[0.6rem] leading-snug text-paper/60">
          Este sello liga criptográficamente el dictamen del vehículo con la
          identidad del vendedor y la fecha exacta de emisión. Alterar
          cualquiera de los tres invalida el sello.
        </p>
      </section>
    </article>
  );
}

function Field({
  label,
  value,
  mono = false,
  alert = false,
  ok = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  alert?: boolean;
  ok?: boolean;
}) {
  return (
    <div>
      <dt className="font-display text-[0.6rem] font-bold uppercase tracking-[0.15em] text-gris">
        {label}
      </dt>
      <dd
        className={`font-semibold ${mono ? 'break-all font-mono text-xs' : ''} ${
          alert ? 'text-rojo' : ok ? 'text-verde' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
