'use client';

/**
 * Tarjeta del "Reporte ShieldCar": el dictamen pericial visual.
 * Recibe el DTO de /api/vehicle/report y pinta el sello global, los cuatro
 * semáforos de fuente, los datos técnicos decodificados y las huellas
 * SHA-256 que quedarán en el audit_log.
 */

import {
  BadgeCheck,
  Banknote,
  CircleHelp,
  Fingerprint,
  Landmark,
  OctagonAlert,
  ReceiptText,
  Siren,
  TriangleAlert,
} from 'lucide-react';
import type { ReportCheck, VehicleReport } from '@/lib/report/build-report';
import type { Verdict } from '@/types/shieldcar';

// ---------------------------------------------------------------------------
// Config visual por veredicto y por fuente
// ---------------------------------------------------------------------------

const VERDICT_STYLE: Record<
  Verdict,
  { chip: string; label: string; icon: React.ReactNode }
> = {
  ok: {
    chip: 'bg-verde-bg text-verde border-verde',
    label: 'Verificado',
    icon: <BadgeCheck className="size-4" aria-hidden />,
  },
  warning: {
    chip: 'bg-ambar-bg text-ambar border-ambar',
    label: 'Atención',
    icon: <TriangleAlert className="size-4" aria-hidden />,
  },
  fail: {
    chip: 'bg-rojo-bg text-rojo border-rojo',
    label: 'Alerta',
    icon: <OctagonAlert className="size-4" aria-hidden />,
  },
  unavailable: {
    chip: 'bg-card text-gris border-gris',
    label: 'Sin verificar',
    icon: <CircleHelp className="size-4" aria-hidden />,
  },
};

const CHECK_META: Record<
  ReportCheck['type'],
  { title: string; icon: React.ReactNode }
> = {
  repuve: {
    title: 'REPUVE · Registro Nacional',
    icon: <Landmark className="size-5" aria-hidden />,
  },
  theft_report: {
    title: 'Reporte de robo activo',
    icon: <Siren className="size-5" aria-hidden />,
  },
  sat_cfdi: {
    title: 'Factura ante el SAT (UUID)',
    icon: <ReceiptText className="size-5" aria-hidden />,
  },
  debts: {
    title: 'Adeudos y tenencias estatales',
    icon: <Banknote className="size-5" aria-hidden />,
  },
};

const GLOBAL_STYLE: Record<Verdict, string> = {
  ok: 'border-verde bg-verde-bg text-verde',
  warning: 'border-ambar bg-ambar-bg text-ambar',
  fail: 'border-rojo bg-rojo-bg text-rojo',
  unavailable: 'border-gris bg-card text-gris',
};

const REGION_LABELS: Record<string, string> = {
  north_america: 'Norteamérica',
  south_america: 'Sudamérica',
  africa: 'África',
  asia: 'Asia',
  europe: 'Europa',
  oceania: 'Oceanía',
  unknown: 'Desconocida',
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export default function VehicleReportCard({
  report,
}: {
  report: VehicleReport;
}) {
  const { global, local, checks } = report;
  const globalIcon =
    global.verdict === 'ok' ? (
      <BadgeCheck className="size-9" strokeWidth={2.25} aria-hidden />
    ) : global.verdict === 'warning' ? (
      <TriangleAlert className="size-9" strokeWidth={2.25} aria-hidden />
    ) : (
      <OctagonAlert className="size-9" strokeWidth={2.25} aria-hidden />
    );

  return (
    <article className="stamp-in hard-shadow border-2 border-ink bg-card">
      {/* Membrete */}
      <header className="flex items-baseline justify-between border-b-2 border-ink px-4 py-2.5">
        <h2 className="font-display text-base font-bold uppercase tracking-wide">
          Reporte ShieldCar
        </h2>
        <time
          dateTime={report.generatedAt}
          className="font-mono text-[0.65rem] text-gris"
        >
          {new Date(report.generatedAt).toLocaleString('es-MX', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </time>
      </header>

      {/* Sello global */}
      <section
        className={`m-4 border-2 px-4 py-3 ${GLOBAL_STYLE[global.verdict]}`}
      >
        <div className="flex items-center gap-3">
          {globalIcon}
          <div>
            <p className="font-display text-2xl font-bold uppercase leading-none tracking-wide">
              {global.label}
            </p>
            <p className="mt-1 text-xs leading-snug text-ink/75">
              {global.summary}
            </p>
          </div>
        </div>
      </section>

      {/* Desglose de fuentes */}
      <section className="px-4">
        <h3 className="font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris">
          Fuentes consultadas
        </h3>
        <ul className="mt-2 divide-y divide-ink/15 border-y border-ink/15">
          {checks.map((check) => {
            const meta = CHECK_META[check.type];
            const style = VERDICT_STYLE[check.result.verdict];
            return (
              <li key={check.type} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 text-ink/70">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">
                    {meta.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-gris">
                    {check.result.summary}
                  </p>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 border px-1.5 py-0.5 font-display text-[0.65rem] font-bold uppercase tracking-wider ${style.chip}`}
                >
                  {style.icon}
                  {style.label}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Datos técnicos decodificados */}
      <section className="px-4 pt-4">
        <h3 className="font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris">
          Datos técnicos del NIV
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <TechField
            label="Fabricante"
            value={local.wmi.manufacturer ?? 'No catalogado'}
          />
          <TechField
            label="Año modelo"
            value={local.wmi.modelYear ? String(local.wmi.modelYear) : '—'}
          />
          <TechField
            label="Origen"
            value={
              local.wmi.country
                ? `${local.wmi.country} · ${REGION_LABELS[local.wmi.region] ?? local.wmi.region}`
                : (REGION_LABELS[local.wmi.region] ?? '—')
            }
          />
          <TechField label="WMI" value={local.wmi.wmi ?? '—'} mono />
          <TechField
            label="Planta (pos. 11)"
            value={report.vin[10] ?? '—'}
            mono
          />
          <TechField
            label="Dígito verificador"
            value={`${local.check.actual} (calculado: ${local.check.expected})`}
            mono
          />
        </dl>
      </section>

      {/* Huellas para el expediente */}
      <footer className="mt-4 border-t border-ink/15 px-4 py-3">
        <p className="flex items-center gap-1.5 font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gris">
          <Fingerprint className="size-3.5" aria-hidden />
          Huellas SHA-256 del expediente
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {checks.map((check) => (
            <li
              key={check.type}
              className="flex justify-between gap-2 font-mono text-[0.6rem] text-gris"
            >
              <span className="uppercase">{check.type}</span>
              <span className="truncate">{check.payloadHash}</span>
            </li>
          ))}
        </ul>
      </footer>
    </article>
  );
}

function TechField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="font-display text-[0.65rem] font-bold uppercase tracking-[0.15em] text-gris">
        {label}
      </dt>
      <dd className={`font-semibold ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
