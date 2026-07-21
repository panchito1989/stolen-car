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
  Camera,
  Factory,
  FlaskConical,
  Globe2,
  LoaderCircle,
  OctagonAlert,
  ScanBarcode,
  ScanSearch,
  TriangleAlert,
} from 'lucide-react';
import VehicleReportCard from '@/components/VehicleReportCard';
import VinCameraScanner from '@/components/vehicle/VinCameraScanner';
import {
  decodeWmi,
  sanitizeVinInput,
  validateVinCheckDigit,
} from '@/lib/providers/vehicle/local-vin-provider';
import type {
  VinCheckDigitResult,
  WmiDecodeResult,
} from '@/lib/providers/vehicle/interface';
import type { MockScenario } from '@/lib/providers/vehicle/mock-aggregator';
import type { VehicleReport } from '@/lib/report/build-report';

const SCENARIO_OPTIONS: { value: MockScenario; label: string }[] = [
  { value: 'clean', label: 'Vehículo limpio' },
  { value: 'stolen', label: 'Con reporte de robo' },
  { value: 'debts', label: 'Con adeudos de tenencia' },
  { value: 'fake_invoice', label: 'Factura falsa ante el SAT' },
  { value: 'unavailable', label: 'Fuentes no disponibles' },
];

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
  const scenarioId = useId();
  const [vin, setVin] = useState('');
  const [scenario, setScenario] = useState<MockScenario>('clean');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [report, setReport] = useState<VehicleReport | null>(null);
  const [scanning, setScanning] = useState(false);

  const complete = vin.length === 17;

  const verdict: LiveVerdict | null = useMemo(() => {
    if (!complete) return null;
    return { check: validateVinCheckDigit(vin), wmi: decodeWmi(vin) };
  }, [vin, complete]);

  const status = verdict?.check.verdict ?? 'idle';
  // Solo se puede pedir reporte con un NIV bien formado (ok o warning).
  const canFetch = status === 'ok' || status === 'warning';

  function handleVinChange(value: string) {
    setVin(sanitizeVinInput(value));
    setReport(null);
    setFetchError(null);
  }

  function handleScanned(scannedVin: string) {
    // El escáner ya validó el dígito verificador; auto-completamos y el
    // semáforo en vivo (useMemo sobre `vin`) reacciona solo.
    setVin(sanitizeVinInput(scannedVin));
    setReport(null);
    setFetchError(null);
    setScanning(false);
  }

  async function fetchReport() {
    if (!canFetch || loading) return;
    setLoading(true);
    setFetchError(null);
    setReport(null);
    try {
      const res = await fetch('/api/vehicle/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vin, scenario }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error: unknown }).error)
            : 'No se pudo generar el reporte.';
        throw new Error(message);
      }
      setReport(data as VehicleReport);
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : 'No se pudo generar el reporte. Intenta de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  }

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
          onChange={(e) => handleVinChange(e.target.value)}
          placeholder="3N1AB7AP0KY000000"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          inputMode="text"
          className={`hard-shadow-sm w-full border-2 bg-card py-4 pl-13 pr-4 font-mono text-lg font-semibold uppercase tracking-[0.14em] placeholder:text-ink/25 focus:outline-2 focus:outline-offset-2 ${inputBorder}`}
        />
      </div>

      {/* Escanear NIV con la cámara */}
      <button
        type="button"
        onClick={() => setScanning(true)}
        className="hard-shadow-sm mt-2 flex w-full items-center justify-center gap-2 border-2 border-ink bg-card px-4 py-3 font-display text-sm font-bold uppercase tracking-wider"
      >
        <Camera className="size-4" aria-hidden />
        Escanear NIV con la cámara
      </button>

      {scanning && (
        <VinCameraScanner
          onDetected={handleScanned}
          onClose={() => setScanning(false)}
        />
      )}

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

      {/* Paso 2: reporte completo (REPUVE, robo, adeudos, SAT) */}
      {canFetch && (
        <div className="stamp-in mt-6 border-t-2 border-dashed border-ink/30 pt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold uppercase tracking-wide">
              Paso 2 · Reporte completo
            </h2>
          </div>

          {/* Selector de escenarios: solo para auditar la UI en demo */}
          <label
            htmlFor={scenarioId}
            className="mt-3 flex items-center gap-1.5 font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris"
          >
            <FlaskConical className="size-3.5" aria-hidden />
            Escenario de prueba (demo)
          </label>
          <select
            id={scenarioId}
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value as MockScenario);
              setReport(null);
              setFetchError(null);
            }}
            disabled={loading}
            className="hard-shadow-sm mt-1.5 w-full appearance-none border-2 border-ink bg-card px-3 py-2.5 text-sm font-medium"
          >
            {SCENARIO_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="hard-shadow mt-4 flex w-full items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-4 font-display text-base font-bold uppercase tracking-wider text-paper transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-70"
          >
            {loading ? (
              <>
                <LoaderCircle className="size-5 animate-spin" aria-hidden />
                Consultando REPUVE y SAT…
              </>
            ) : (
              <>
                <ScanSearch className="size-5" aria-hidden />
                Consultar reporte completo
              </>
            )}
          </button>

          {fetchError && (
            <p
              role="alert"
              className="mt-3 border-2 border-rojo bg-rojo-bg px-3 py-2 text-sm font-medium text-rojo"
            >
              {fetchError}
            </p>
          )}

          {report && (
            <div className="mt-5">
              <VehicleReportCard report={report} />
            </div>
          )}
        </div>
      )}
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
