'use client';

/**
 * Stepper de verificación de identidad (KYC ligero, Fase 2).
 *
 * Paso 1: captura de INE (frente y reverso) · Paso 2: selfie biométrica con
 * óvalo de guía · Paso 3: dictamen. Las capturas son simuladas (mock); la
 * cámara real con getUserMedia llega cuando se integre el proveedor de KYC.
 * Mismo lenguaje visual del dictamen pericial: papel, tinta, semáforo.
 */

import { useId, useState } from 'react';
import {
  BadgeCheck,
  Camera,
  FlaskConical,
  Fingerprint,
  IdCard,
  LoaderCircle,
  OctagonAlert,
  RotateCcw,
  ScanFace,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import type { IdentityScenario } from '@/lib/identity/mock-provider';
import {
  KYC_VERDICT_TO_SEMAPHORE,
  type KycReport,
} from '@/lib/identity/types';

const SCENARIO_OPTIONS: { value: IdentityScenario; label: string }[] = [
  { value: 'valid_ine', label: 'INE válida y vigente' },
  { value: 'expired_ine', label: 'INE vencida (vigencia 2023)' },
  { value: 'curp_mismatch', label: 'CURP inconsistente en el OCR' },
  { value: 'face_mismatch', label: 'Rostro no coincide (suplantación)' },
  { value: 'fake_document', label: 'Documento alterado digitalmente' },
];

type KycResponse = KycReport & {
  payloadHash: string;
  audit: { recorded: boolean; auditHash?: string };
};

const VERDICT_UI = {
  VERIFIED: {
    label: 'Identidad verificada',
    icon: BadgeCheck,
    box: 'border-verde bg-verde-bg text-verde',
  },
  MANUAL_REVIEW: {
    label: 'Revisión manual',
    icon: TriangleAlert,
    box: 'border-ambar bg-ambar-bg text-ambar',
  },
  REJECTED: {
    label: 'Identidad rechazada',
    icon: OctagonAlert,
    box: 'border-rojo bg-rojo-bg text-rojo',
  },
} as const;

export default function KycStepper() {
  const scenarioId = useId();
  const [front, setFront] = useState(false);
  const [back, setBack] = useState(false);
  const [selfie, setSelfie] = useState(false);
  const [scenario, setScenario] = useState<IdentityScenario>('valid_ine');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KycResponse | null>(null);

  const readyToVerify = front && back && selfie && !result;

  function resetAll() {
    setFront(false);
    setBack(false);
    setSelfie(false);
    setResult(null);
    setError(null);
  }

  async function verify() {
    if (!readyToVerify || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/identity/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontImage: 'data:image/jpeg;base64,SIMULADO_FRENTE',
          backImage: 'data:image/jpeg;base64,SIMULADO_REVERSO',
          selfieFrame: 'data:image/jpeg;base64,SIMULADO_SELFIE',
          scenario,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error: unknown }).error)
            : 'No se pudo verificar la identidad.';
        throw new Error(message);
      }
      setResult(data as KycResponse);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo verificar la identidad.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="w-full">
      {/* Paso 1 — INE */}
      <h2 className="font-display text-lg font-bold uppercase tracking-wide">
        Paso 1 · Credencial INE
      </h2>
      <p className="mt-1 text-sm leading-snug text-gris">
        Fotografía ambos lados sobre una superficie plana, sin reflejos.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <CaptureZone
          label="Frente"
          captured={front}
          disabled={loading || !!result}
          onCapture={() => setFront(true)}
        />
        <CaptureZone
          label="Reverso"
          captured={back}
          disabled={loading || !!result}
          onCapture={() => setBack(true)}
        />
      </div>

      {/* Paso 2 — Selfie */}
      <h2 className="mt-7 font-display text-lg font-bold uppercase tracking-wide">
        Paso 2 · Selfie biométrica
      </h2>
      <p className="mt-1 text-sm leading-snug text-gris">
        Centra tu rostro en el óvalo, con buena luz y sin lentes oscuros.
      </p>
      <div className="hard-shadow-sm mt-3 border-2 border-ink bg-card px-4 py-5">
        <div
          className={`mx-auto flex h-44 w-36 items-center justify-center rounded-[50%] border-4 border-dashed ${
            selfie ? 'border-verde bg-verde-bg' : 'border-ink/30'
          }`}
          aria-hidden
        >
          {selfie ? (
            <ScanFace className="size-14 text-verde" strokeWidth={1.5} />
          ) : (
            <UserRound className="size-14 text-ink/25" strokeWidth={1.5} />
          )}
        </div>
        <button
          type="button"
          onClick={() => setSelfie(true)}
          disabled={selfie || loading || !!result}
          className="hard-shadow-sm mt-4 flex w-full items-center justify-center gap-2 border-2 border-ink bg-card px-3 py-3 font-display text-sm font-bold uppercase tracking-wider disabled:opacity-60"
        >
          <Camera className="size-4" aria-hidden />
          {selfie ? 'Captura registrada' : 'Simular captura biométrica'}
        </button>
      </div>

      {/* Escenario demo + acción */}
      {!result && (
        <div className="mt-7 border-t-2 border-dashed border-ink/30 pt-5">
          <label
            htmlFor={scenarioId}
            className="flex items-center gap-1.5 font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris"
          >
            <FlaskConical className="size-3.5" aria-hidden />
            Escenario de prueba (demo)
          </label>
          <select
            id={scenarioId}
            value={scenario}
            onChange={(e) => setScenario(e.target.value as IdentityScenario)}
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
            onClick={verify}
            disabled={!readyToVerify || loading}
            className="hard-shadow mt-4 flex w-full items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-4 font-display text-base font-bold uppercase tracking-wider text-paper transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-60"
          >
            {loading ? (
              <>
                <LoaderCircle className="size-5 animate-spin" aria-hidden />
                Procesando OCR y biometría…
              </>
            ) : (
              <>
                <Fingerprint className="size-5" aria-hidden />
                Generar dictamen de identidad
              </>
            )}
          </button>
          {!front || !back || !selfie ? (
            <p className="mt-2 text-center text-xs text-gris">
              Completa las tres capturas para habilitar la verificación.
            </p>
          ) : null}

          {error && (
            <p
              role="alert"
              className="mt-3 border-2 border-rojo bg-rojo-bg px-3 py-2 text-sm font-medium text-rojo"
            >
              {error}
            </p>
          )}
        </div>
      )}

      {/* Dictamen */}
      {result && (
        <div className="mt-7">
          <IdentityVerdictCard result={result} />
          <button
            type="button"
            onClick={resetAll}
            className="hard-shadow-sm mt-4 flex w-full items-center justify-center gap-2 border-2 border-ink bg-card px-3 py-3 font-display text-sm font-bold uppercase tracking-wider"
          >
            <RotateCcw className="size-4" aria-hidden />
            Verificar otra identidad
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Zona de captura de la INE
// ---------------------------------------------------------------------------

function CaptureZone({
  label,
  captured,
  disabled,
  onCapture,
}: {
  label: string;
  captured: boolean;
  disabled: boolean;
  onCapture: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCapture}
      disabled={captured || disabled}
      className={`hard-shadow-sm flex aspect-[8/5] flex-col items-center justify-center gap-1.5 border-2 px-2 ${
        captured
          ? 'border-verde bg-verde-bg'
          : 'border-dashed border-ink/40 bg-card'
      }`}
    >
      <IdCard
        className={`size-8 ${captured ? 'text-verde' : 'text-ink/30'}`}
        strokeWidth={1.5}
        aria-hidden
      />
      <span className="font-display text-xs font-bold uppercase tracking-wider">
        {label}
      </span>
      <span
        className={`text-[0.65rem] font-medium uppercase ${
          captured ? 'text-verde' : 'text-gris'
        }`}
      >
        {captured ? '✓ Capturada' : 'Tocar para capturar'}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dictamen de Identidad
// ---------------------------------------------------------------------------

function IdentityVerdictCard({ result }: { result: KycResponse }) {
  const ui = VERDICT_UI[result.verdict];
  const Icon = ui.icon;
  const semaphore = KYC_VERDICT_TO_SEMAPHORE[result.verdict];

  return (
    <article className="stamp-in hard-shadow border-2 border-ink bg-card">
      <header className="flex items-baseline justify-between border-b-2 border-ink px-4 py-2.5">
        <h2 className="font-display text-base font-bold uppercase tracking-wide">
          Dictamen de identidad
        </h2>
        <time
          dateTime={result.generatedAt}
          className="font-mono text-[0.65rem] text-gris"
        >
          {new Date(result.generatedAt).toLocaleString('es-MX', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </time>
      </header>

      {/* Sello */}
      <section className={`m-4 border-2 px-4 py-3 ${ui.box}`}>
        <div className="flex items-center gap-3">
          <Icon className="size-9" strokeWidth={2.25} aria-hidden />
          <p className="font-display text-2xl font-bold uppercase leading-none tracking-wide">
            {ui.label}
          </p>
        </div>
        {result.reasons.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs leading-snug text-ink/75">
            {result.reasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Datos extraídos */}
      <section className="px-4">
        <h3 className="font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris">
          Datos extraídos (OCR)
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Field
            label="Nombre"
            value={`${result.ine.nombre} ${result.ine.primerApellido} ${result.ine.segundoApellido ?? ''}`.trim()}
          />
          <Field
            label="Vigencia"
            value={String(result.ine.vigencia)}
            alert={!result.checks.vigente}
          />
          <Field
            label="CURP"
            value={result.ine.curp}
            mono
            alert={!result.checks.curpValid}
          />
          <Field label="Modelo INE" value={result.ine.modelo} mono />
          <Field label="Clave de elector" value={result.ine.claveElector} mono />
          <Field label="CIC" value={result.ine.cic} mono />
        </dl>
      </section>

      {/* Biometría */}
      <section className="px-4 pt-4">
        <h3 className="font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris">
          Biometría
        </h3>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Field
            label="Coincidencia facial"
            value={`${result.biometric.faceMatchScore}%`}
            alert={semaphore === 'fail' && result.biometric.faceMatchScore < 40}
          />
          <Field
            label="Prueba de vida"
            value={
              result.biometric.livenessPassed
                ? `Superada (${result.biometric.livenessScore}%)`
                : 'Fallida'
            }
            alert={!result.biometric.livenessPassed}
          />
        </dl>
      </section>

      {/* Huella probatoria */}
      <footer className="mt-4 border-t border-ink/15 px-4 py-3">
        <p className="flex items-center gap-1.5 font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gris">
          <Fingerprint className="size-3.5" aria-hidden />
          Huella SHA-256 del dictamen
        </p>
        <p className="mt-1 break-all font-mono text-[0.6rem] text-gris">
          {result.payloadHash}
        </p>
        <p className="mt-1.5 font-mono text-[0.6rem] uppercase text-gris">
          {result.audit.recorded
            ? `Auditado en cadena · ${result.audit.auditHash?.slice(0, 16)}…`
            : 'Sin auditar (Supabase offline)'}
        </p>
      </footer>
    </article>
  );
}

function Field({
  label,
  value,
  mono = false,
  alert = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  alert?: boolean;
}) {
  return (
    <div>
      <dt className="font-display text-[0.65rem] font-bold uppercase tracking-[0.15em] text-gris">
        {label}
      </dt>
      <dd
        className={`font-semibold ${mono ? 'break-all font-mono text-xs' : ''} ${
          alert ? 'text-rojo' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
