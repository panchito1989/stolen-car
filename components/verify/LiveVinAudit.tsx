'use client';

/**
 * ShieldCar — Auditoría física en campo (Liveness Check del vehículo).
 *
 * En la vista pública, el comprador escanea el NIV del auto que tiene
 * enfrente. El resultado se compara CONTRA EL SERVIDOR (nunca recibe el NIV
 * real del expediente) y muestra un veredicto destellante: verde si el auto
 * coincide con el certificado sellado, rojo de alerta máxima si no.
 */

import { useState } from 'react';
import { CheckCircle2, LoaderCircle, ScanLine, XCircle } from 'lucide-react';
import VinCameraScanner from '@/components/vehicle/VinCameraScanner';

type AuditState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'match' }
  | { phase: 'mismatch' }
  | { phase: 'error'; message: string };

export default function LiveVinAudit({ seal }: { seal: string }) {
  const [scanning, setScanning] = useState(false);
  const [audit, setAudit] = useState<AuditState>({ phase: 'idle' });

  async function onDetected(scannedVin: string) {
    setScanning(false);
    setAudit({ phase: 'checking' });
    try {
      const res = await fetch('/api/verify/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seal, vin: scannedVin }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as { error: unknown }).error)
            : 'No se pudo verificar el NIV.';
        setAudit({ phase: 'error', message });
        return;
      }
      const matched = (data as { match?: boolean }).match === true;
      setAudit({ phase: matched ? 'match' : 'mismatch' });
    } catch {
      setAudit({
        phase: 'error',
        message: 'Falló la conexión. Reintenta el escaneo.',
      });
    }
  }

  // Veredicto de coincidencia a pantalla completa.
  if (audit.phase === 'match' || audit.phase === 'mismatch') {
    const matched = audit.phase === 'match';
    return (
      <div
        className="verdict-flash fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white"
        style={{ backgroundColor: matched ? '#10B981' : '#EF4444' }}
        role="alert"
      >
        {matched ? (
          <CheckCircle2 className="size-24" strokeWidth={2} aria-hidden />
        ) : (
          <XCircle className="size-24" strokeWidth={2} aria-hidden />
        )}
        <p className="mt-5 font-display text-3xl font-bold uppercase leading-tight tracking-tight">
          {matched
            ? '✓ NIV físico verificado: el auto coincide con el expediente blindado'
            : '✕ Alerta grave: el NIV del auto NO coincide con este certificado'}
        </p>
        {!matched && (
          <p className="mt-4 font-display text-base font-bold uppercase tracking-wider">
            No entregues dinero. Podría ser un auto clonado.
          </p>
        )}
        <button
          type="button"
          onClick={() => setAudit({ phase: 'idle' })}
          className="mt-8 border-2 border-white px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider"
        >
          Escanear de nuevo
        </button>
      </div>
    );
  }

  return (
    <section className="mt-4 border-2 border-ink bg-card px-4 py-4">
      <p className="font-display text-sm font-bold uppercase tracking-wide">
        Auditoría físicamente en campo
      </p>
      <p className="mt-1 text-xs leading-snug text-gris">
        Escanea el NIV del auto que tienes enfrente y confirma que coincide con
        este certificado.
      </p>

      <button
        type="button"
        onClick={() => {
          setAudit({ phase: 'idle' });
          setScanning(true);
        }}
        disabled={audit.phase === 'checking'}
        className="hard-shadow mt-3 flex w-full items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-4 font-display text-base font-bold uppercase tracking-wider text-paper active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-70"
      >
        {audit.phase === 'checking' ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            Comparando…
          </>
        ) : (
          <>
            <ScanLine className="size-5" aria-hidden />
            Escanear auto en vivo
          </>
        )}
      </button>

      {audit.phase === 'error' && (
        <p
          role="alert"
          className="mt-3 border-2 border-rojo bg-rojo-bg px-3 py-2 text-sm font-medium text-rojo"
        >
          {audit.message}
        </p>
      )}

      {scanning && (
        <VinCameraScanner
          onDetected={onDetected}
          onClose={() => setScanning(false)}
        />
      )}
    </section>
  );
}
