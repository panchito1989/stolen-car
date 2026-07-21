'use client';

/**
 * ShieldCar — Visor pericial de NIV por cámara.
 *
 * Overlay a pantalla completa que abre la cámara trasera y decodifica códigos
 * de barras (Code 39 / Code 128 / Data Matrix) del parabrisas, puerta o
 * tarjeta de circulación. La librería de ZXing se importa dinámicamente para
 * no evaluarse en el render de servidor (SSR) del componente cliente.
 *
 * Toda lectura pasa por `parseVinFromBarcode`: solo un NIV con dígito
 * verificador válido dispara `onDetected`. Incluye un botón "Simular escaneo"
 * para auditar la UI en escritorio sin cámara.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Keyboard,
  RotateCcw,
  ScanLine,
  X,
} from 'lucide-react';
import { parseVinFromBarcode } from '@/lib/vehicle/barcode-parser';

/** NIV válido de demo (Nissan México, check digit correcto). */
const DEMO_VIN = '3N1AB7AP0KY000000';

type ScannerState = 'starting' | 'scanning' | 'denied' | 'error';

export default function VinCameraScanner({
  onDetected,
  onClose,
  demoVin = DEMO_VIN,
}: {
  onDetected: (vin: string) => void;
  onClose: () => void;
  demoVin?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [state, setState] = useState<ScannerState>('starting');
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    stop();
    onClose();
  }, [stop, onClose]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setState('starting');
      try {
        // Import dinámico: estos módulos tocan APIs del navegador.
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] =
          await Promise.all([import('@zxing/browser'), import('@zxing/library')]);

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_128,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.QR_CODE,
        ]);

        const reader = new BrowserMultiFormatReader(hints);
        if (cancelled) return;

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result) => {
            if (!result) return;
            const parsed = parseVinFromBarcode(result.getText());
            if (parsed.valid && parsed.vin) {
              stop();
              onDetected(parsed.vin);
            }
            // Lecturas inválidas se ignoran en silencio: la cámara sigue.
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setState('scanning');
      } catch (err) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name ?? '';
        setState(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'denied'
            : 'error',
        );
      }
    }

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [attempt, onDetected, stop]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink/95 text-paper backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Escáner de NIV"
    >
      {/* Barra superior */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanLine className="size-5" aria-hidden />
          <span className="font-display text-sm font-bold uppercase tracking-[0.15em]">
            Escanear NIV
          </span>
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar escáner"
          className="grid size-9 place-items-center border-2 border-paper/40"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {/* Zona de video / estados */}
      <div className="relative flex-1 overflow-hidden">
        {(state === 'starting' || state === 'scanning') && (
          <>
            <video
              ref={videoRef}
              className="size-full object-cover"
              muted
              playsInline
            />
            {/* Marco de apuntado + línea de escaneo */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-40 w-[85%] max-w-md">
                {/* Esquinas del marco */}
                <span className="absolute left-0 top-0 size-8 border-l-4 border-t-4 border-verde" />
                <span className="absolute right-0 top-0 size-8 border-r-4 border-t-4 border-verde" />
                <span className="absolute bottom-0 left-0 size-8 border-b-4 border-l-4 border-verde" />
                <span className="absolute bottom-0 right-0 size-8 border-b-4 border-r-4 border-verde" />
                {/* Línea que barre */}
                <span className="scanline absolute left-2 right-2 h-0.5 bg-verde shadow-[0_0_8px_2px] shadow-verde" />
              </div>
            </div>
            {state === 'starting' && (
              <p className="absolute inset-x-0 top-1/2 text-center font-display text-sm uppercase tracking-wider">
                Iniciando cámara…
              </p>
            )}
          </>
        )}

        {state === 'denied' && (
          <PermissionError
            title="Cámara bloqueada"
            message="No pudimos acceder a la cámara. Habilita el permiso en tu navegador y reintenta, o captura el NIV con el teclado."
            onRetry={() => setAttempt((a) => a + 1)}
            onKeyboard={handleClose}
          />
        )}
        {state === 'error' && (
          <PermissionError
            title="No se pudo iniciar la cámara"
            message="Puede que tu dispositivo no tenga cámara disponible. Reintenta o captura el NIV con el teclado."
            onRetry={() => setAttempt((a) => a + 1)}
            onKeyboard={handleClose}
          />
        )}
      </div>

      {/* Instrucción + acciones */}
      <div className="space-y-3 px-4 py-4">
        <p className="text-center text-sm leading-snug text-paper/80">
          Apunta al código de barras en el parabrisas, la puerta del conductor
          o la tarjeta de circulación.
        </p>
        <button
          type="button"
          onClick={() => onDetected(demoVin)}
          className="flex w-full items-center justify-center gap-2 border-2 border-paper/40 bg-paper/5 px-4 py-3 font-display text-xs font-bold uppercase tracking-wider text-paper/80"
        >
          <Camera className="size-4" aria-hidden />
          Simular escaneo (modo demo)
        </button>
      </div>
    </div>
  );
}

function PermissionError({
  title,
  message,
  onRetry,
  onKeyboard,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  onKeyboard: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <p className="font-display text-2xl font-bold uppercase tracking-tight text-rojo">
        {title}
      </p>
      <p className="mt-3 max-w-sm text-sm leading-snug text-paper/80">
        {message}
      </p>
      <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center justify-center gap-2 border-2 border-paper bg-paper px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-ink"
        >
          <RotateCcw className="size-4" aria-hidden />
          Reintentar cámara
        </button>
        <button
          type="button"
          onClick={onKeyboard}
          className="flex items-center justify-center gap-2 border-2 border-paper/40 px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-paper/80"
        >
          <Keyboard className="size-4" aria-hidden />
          Capturar con teclado
        </button>
      </div>
    </div>
  );
}
