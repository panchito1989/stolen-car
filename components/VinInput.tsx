'use client';

/**
 * Captura de NIV con semáforo en vivo.
 *
 * Todo el veredicto se calcula OFFLINE con `local-vin-provider` (check
 * digit ISO 3779 + decodificación WMI): retroalimentación instantánea sin
 * gastar una sola consulta de pago. Pensado para usarse con una mano, de
 * pie junto al vehículo.
 */

import { useId, useMemo, useState } from 'react';
import {
  BadgeCheck,
  CalendarRange,
  Factory,
  Globe2,
  OctagonAlert,
  ScanBarcode,
  TriangleAlert,
} from 'lucide-react';
import {
  decodeWmi,
  sanitizeVinInput,
  validateVinCheckDigit,
} from '@/lib/providers/vehicle/local-vin-provider';
import type {
  VinCheckDigitResult,
  WmiDecodeResult,
} from '@/lib/providers/vehicle/interface';

const REGION_LABELS: Record<WmiDecodeResult['region'], string> = {
  north_america: 'Norteamérica',
  south_america: 'Sudamérica',
  africa: 'África',
  asia: 'Asia',
  europe: 'Europa',
  oceania: 'Oceanía',
  unknown: 'Región desconocida',
};

interface LiveVerdict {
  check: VinCheckDigitResult;
  wmi: WmiDecodeResult;
}

export default function VinInput() {
  const inputId = useId();
  const [vin, setVin] = useState('');

  const complete = vin.length === 17;

  const verdict: LiveVerdict | null = useMemo(() => {
    if (!complete) return null;
    return { check: validateVinCheckDigit(vin), wmi: decodeWmi(vin) };
  }, [vin, complete]);

  const status = verdict?.check.verdict ?? 'idle';

  const inputBorder =
    status === 'ok'
      ? 'border-verde focus:outline-verde'
      : status === 'warning'
        ? 'border-ambar focus:outline-ambar'
        : status === 'fail'
          ? 'border-rojo focus:outline-rojo'
          : 'border-ink focus:outline-ink';

  return (
    <section className="w-full">
      {/* Campo de captura */}
      <label
        htmlFor={inputId}
        className="font-display text-sm font-bold uppercase tracking-[0.2em] text-gris"
      >
        NIV / Número de serie (17 caracteres)
      </label>

      <div className="relative mt-2">
        <ScanBarcode
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-gris"
        />
        <input
          id={inputId}
          value={vin}
          onChange={(e) => setVin(sanitizeVinInput(e.target.value))}
          placeholder="3N1AB7AP5KY000000"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          inputMode="text"
          className={`hard-shadow-sm w-full border-2 bg-card py-4 pl-13 pr-4 font-mono text-lg font-semibold uppercase tracking-[0.14em] placeholder:text-ink/25 focus:outline-2 focus:outline-offset-2 ${inputBorder}`}
        />
      </div>

      {/* Progreso: 17 casillas; la 9.ª es el dígito verificador */}
      <div className="mt-3 flex items-center gap-3">
        <div
          className="grid flex-1 grid-cols-17 gap-[3px]"
          aria-hidden
          title="La casilla marcada es el dígito verificador (posición 9)"
        >
          {Array.from({ length: 17 }, (_, i) => (
            <span
              key={i}
              className={`h-2 border border-ink/40 ${
                i < vin.length ? 'bg-ink' : 'bg-transparent'
              } ${i === 8 ? 'outline outline-1 outline-offset-1 outline-gris' : ''}`}
            />
          ))}
        </div>
        <span className="font-mono text-xs tabular-nums text-gris">
          {vin.length}/17
        </span>
      </div>

      {/* Semáforo en vivo */}
      <div role="status" aria-live="polite" className="mt-5 min-h-28">
        {!verdict && (
          <p className="border-l-4 border-ink/20 pl-3 text-sm text-gris">
            Cópialo de la tarjeta de circulación o del parabrisas (base del
            lado del conductor). La validación es instantánea y sin costo.
          </p>
        )}

        {verdict && verdict.check.verdict === 'ok' && (
          <OkCard key={vin} v={verdict} />
        )}
        {verdict && verdict.check.verdict === 'warning' && (
          <WarningCard key={vin} v={verdict} />
        )}
        {verdict && verdict.check.verdict === 'fail' && (
          <FailCard key={vin} check={verdict.check} />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sellos de veredicto
// ---------------------------------------------------------------------------

function OkCard({ v }: { v: LiveVerdict }) {
  const { wmi } = v;
  return (
    <div className="stamp-in hard-shadow border-2 border-verde bg-verde-bg">
      <div className="flex items-center gap-3 border-b-2 border-verde/30 px-4 py-3">
        <BadgeCheck className="size-7 shrink-0 text-verde" aria-hidden />
        <div>
          <p className="font-display text-lg font-bold uppercase leading-none tracking-wide text-verde">
            NIV consistente
          </p>
          <p className="mt-1 text-xs text-ink/70">
            Dígito verificador correcto (ISO 3779). Siguiente paso: REPUVE y
            SAT.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4">
        <DecodedField
          icon={<Factory className="size-4" aria-hidden />}
          label="Fabricante"
          value={wmi.manufacturer ?? `No catalogado (WMI ${wmi.wmi})`}
          muted={!wmi.manufacturer}
        />
        <DecodedField
          icon={<CalendarRange className="size-4" aria-hidden />}
          label="Año modelo"
          value={wmi.modelYear ? String(wmi.modelYear) : 'No determinable'}
          muted={!wmi.modelYear}
        />
        <DecodedField
          icon={<Globe2 className="size-4" aria-hidden />}
          label="Origen"
          value={
            wmi.country
              ? `${wmi.country} · ${REGION_LABELS[wmi.region]}`
              : REGION_LABELS[wmi.region]
          }
        />
        <DecodedField
          icon={<ScanBarcode className="size-4" aria-hidden />}
          label="WMI"
          value={wmi.wmi ?? '—'}
          mono
        />
      </dl>

      {!wmi.manufacturer && (
        <p className="border-t border-verde/30 px-4 py-2 text-xs text-ink/70">
          {wmi.reason}
        </p>
      )}
    </div>
  );
}

function WarningCard({ v }: { v: LiveVerdict }) {
  const { check, wmi } = v;
  return (
    <div className="stamp-in hard-shadow border-2 border-ambar bg-ambar-bg px-4 py-3">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-7 shrink-0 text-ambar" aria-hidden />
        <div>
          <p className="font-display text-lg font-bold uppercase leading-none tracking-wide text-ambar">
            Revisión manual sugerida
          </p>
          <p className="mt-2 text-sm leading-snug text-ink/80">
            Este NIV es de{' '}
            <strong>
              {wmi.country ?? REGION_LABELS[wmi.region]}
            </strong>{' '}
            y fuera de Norteamérica el dígito verificador (Módulo 11) no es
            obligatorio, así que esta prueba no aplica. No es señal de fraude:
            continúa con REPUVE, SAT y la inspección física de seriales.
          </p>
          <p className="mt-2 font-mono text-xs text-ink/60">
            Calculado: {check.expected} · En el NIV: {check.actual}
          </p>
        </div>
      </div>
    </div>
  );
}

function FailCard({ check }: { check: VinCheckDigitResult }) {
  const malformed = check.valid === null;
  return (
    <div className="stamp-in hard-shadow border-2 border-rojo bg-rojo-bg px-4 py-3">
      <div className="flex items-start gap-3">
        <OctagonAlert className="mt-0.5 size-7 shrink-0 text-rojo" aria-hidden />
        <div>
          <p className="font-display text-lg font-bold uppercase leading-none tracking-wide text-rojo">
            {malformed ? 'NIV malformado' : 'Dígito verificador inválido'}
          </p>
          <p className="mt-2 text-sm leading-snug text-ink/80">{check.reason}</p>
          {!malformed && (
            <p className="mt-2 text-sm font-medium text-rojo">
              Verifica carácter por carácter contra la tarjeta de circulación.
              Si el documento coincide con lo que tecleaste, desconfía: puede
              tratarse de un NIV alterado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DecodedField({
  icon,
  label,
  value,
  mono = false,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 font-display text-[0.7rem] font-bold uppercase tracking-[0.15em] text-gris">
        {icon}
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold ${mono ? 'font-mono' : ''} ${
          muted ? 'text-ink/50' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
