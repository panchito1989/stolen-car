'use client';

/**
 * ShieldCar — Lector de NIV por OBD-II (anti-clonación).
 *
 * Se conecta a un adaptador ELM327 BLE, envía el comando "0902" (Modo 09 PID
 * 02), lee el NIV grabado en la computadora del auto (ECU) y lo compara con
 * el NIV de los papeles. Si NO coinciden, es una alerta de clonación: el
 * ladrón pudo falsificar el metal y el papel, pero no el cerebro del auto.
 *
 * La lectura Bluetooth solo funciona en Chrome/Edge de Android (Web Bluetooth).
 * En iPhone y escritorio no hay Web Bluetooth: se ofrece el modo simulación y
 * se explica la limitación. El parseo de la respuesta vive en `obd-parser.ts`
 * y está cubierto por pruebas; aquí solo va la parte de hardware.
 */

import { useState } from 'react';
import {
  BadgeCheck,
  Bluetooth,
  Cpu,
  LoaderCircle,
  OctagonAlert,
  TriangleAlert,
  X,
} from 'lucide-react';
import { parseVinFromObd } from '@/lib/vehicle/obd-parser';
import { vinsMatch } from '@/lib/vehicle/barcode-parser';

// Servicios BLE comunes en adaptadores ELM327 (varían por fabricante).
const ELM_SERVICES = [
  '0000fff0-0000-1000-8000-00805f9b34fb', // FFF0 (clones HM-10)
  '0000ffe0-0000-1000-8000-00805f9b34fb', // FFE0
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
];

type Phase =
  | { k: 'idle' }
  | { k: 'connecting' }
  | { k: 'reading' }
  | { k: 'match'; ecuVin: string }
  | { k: 'mismatch'; ecuVin: string }
  | { k: 'unsupported' }
  | { k: 'error'; message: string };

function hasWebBluetooth(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export default function ObdVinReader({
  papersVin,
  onClose,
}: {
  papersVin: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });

  function evaluate(ecuVin: string) {
    setPhase(
      vinsMatch(papersVin, ecuVin)
        ? { k: 'match', ecuVin }
        : { k: 'mismatch', ecuVin },
    );
  }

  // --- Simulación (sin hardware): permite auditar el flujo de punta a punta ---
  function simulate(scenario: 'match' | 'clone') {
    setPhase({ k: 'reading' });
    const ecuVin = scenario === 'match' ? papersVin : '1HGCM82633A004352';
    setTimeout(() => evaluate(ecuVin), 700);
  }

  // --- Lectura real por Web Bluetooth (Android) ---
  async function connectAndRead() {
    if (!hasWebBluetooth()) {
      setPhase({ k: 'unsupported' });
      return;
    }
    setPhase({ k: 'connecting' });
    try {
      const bt = (navigator as Navigator & { bluetooth: any }).bluetooth;
      const device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: ELM_SERVICES,
      });
      const server = await device.gatt.connect();

      // Busca la primera característica escribible/notificable de los servicios
      // conocidos del ELM327.
      let write: any = null;
      let notify: any = null;
      for (const svcUuid of ELM_SERVICES) {
        try {
          const svc = await server.getPrimaryService(svcUuid);
          const chars = await svc.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) write = c;
            if (c.properties.notify) notify = c;
          }
          if (write && notify) break;
        } catch {
          // Servicio no presente en este adaptador; probamos el siguiente.
        }
      }
      if (!write || !notify) {
        throw new Error('El adaptador no expone un canal serie compatible.');
      }

      setPhase({ k: 'reading' });

      const decoder = new TextDecoder();
      let buffer = '';
      const done = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Tiempo agotado esperando la respuesta OBD-II.')),
          8000,
        );
        notify.addEventListener('characteristicvaluechanged', (e: any) => {
          buffer += decoder.decode(e.target.value);
          if (buffer.includes('>')) {
            clearTimeout(timer);
            resolve(buffer);
          }
        });
      });
      await notify.startNotifications();

      const enc = new TextEncoder();
      const send = (cmd: string) => write.writeValue(enc.encode(`${cmd}\r`));
      // Init mínimo del ELM327 y consulta del NIV.
      await send('ATZ');
      await send('ATE0');
      await send('ATSP0');
      await send('0902');

      const raw = await done;
      const parsed = parseVinFromObd(raw);
      if (!parsed.valid || !parsed.vin) {
        setPhase({ k: 'error', message: parsed.error ?? 'Lectura inválida.' });
        return;
      }
      evaluate(parsed.vin);
    } catch (err) {
      setPhase({
        k: 'error',
        message:
          err instanceof Error ? err.message : 'No se pudo leer por OBD-II.',
      });
    }
  }

  // Veredicto a pantalla completa.
  if (phase.k === 'match' || phase.k === 'mismatch') {
    const matched = phase.k === 'match';
    return (
      <div
        className="verdict-flash fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-white"
        style={{ backgroundColor: matched ? '#10B981' : '#EF4444' }}
        role="alert"
      >
        {matched ? (
          <BadgeCheck className="size-24" strokeWidth={2} aria-hidden />
        ) : (
          <OctagonAlert className="size-24" strokeWidth={2} aria-hidden />
        )}
        <p className="mt-5 font-display text-3xl font-bold uppercase leading-tight tracking-tight">
          {matched
            ? '✓ NIV de la computadora VERIFICADO: coincide con los papeles'
            : '✕ ALERTA DE CLONACIÓN: la computadora del auto tiene otro NIV'}
        </p>
        <p className="mt-4 font-mono text-sm">
          Papeles: {papersVin} · ECU: {phase.ecuVin}
        </p>
        {!matched && (
          <p className="mt-3 font-display text-base font-bold uppercase tracking-wider">
            No compres este auto. Es muy probable que sea robado y clonado.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-8 border-2 border-white px-5 py-2.5 font-display text-sm font-bold uppercase tracking-wider"
        >
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink/95 text-paper backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Lector OBD-II"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Cpu className="size-5" aria-hidden />
          <span className="font-display text-sm font-bold uppercase tracking-[0.15em]">
            NIV en la computadora (OBD-II)
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="grid size-9 place-items-center border-2 border-paper/40"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {(phase.k === 'connecting' || phase.k === 'reading') && (
          <>
            <LoaderCircle className="size-14 animate-spin" aria-hidden />
            <p className="mt-4 font-display text-lg uppercase tracking-wide">
              {phase.k === 'connecting'
                ? 'Conectando con el adaptador…'
                : 'Leyendo la computadora del auto…'}
            </p>
          </>
        )}

        {phase.k === 'unsupported' && (
          <>
            <TriangleAlert className="size-14 text-ambar" aria-hidden />
            <p className="mt-4 font-display text-xl font-bold uppercase tracking-tight text-ambar">
              Este dispositivo no puede leer OBD-II
            </p>
            <p className="mt-3 max-w-sm text-sm leading-snug text-paper/80">
              La lectura Bluetooth de la computadora solo funciona en Chrome de
              Android. En iPhone o computadora, usa el escaneo del NIV por
              cámara y las demás verificaciones.
            </p>
          </>
        )}

        {phase.k === 'error' && (
          <>
            <TriangleAlert className="size-14 text-rojo" aria-hidden />
            <p className="mt-4 font-display text-xl font-bold uppercase tracking-tight text-rojo">
              No se pudo leer
            </p>
            <p className="mt-3 max-w-sm text-sm leading-snug text-paper/80">
              {phase.message}
            </p>
          </>
        )}

        {phase.k === 'idle' && (
          <>
            <Bluetooth className="size-14 text-paper/70" aria-hidden />
            <p className="mt-4 max-w-sm text-sm leading-snug text-paper/80">
              Conecta un adaptador OBD-II Bluetooth al puerto del auto (debajo
              del volante) y presiona conectar. Compararemos el NIV grabado de
              fábrica contra el de los papeles: {papersVin}.
            </p>
          </>
        )}
      </div>

      <div className="space-y-3 px-4 py-4">
        {phase.k !== 'connecting' && phase.k !== 'reading' && (
          <button
            type="button"
            onClick={connectAndRead}
            className="hard-shadow flex w-full items-center justify-center gap-2 border-2 border-paper bg-paper px-4 py-4 font-display text-base font-bold uppercase tracking-wider text-ink"
          >
            <Bluetooth className="size-5" aria-hidden />
            Conectar adaptador OBD-II
          </button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => simulate('match')}
            className="flex-1 border-2 border-paper/40 bg-paper/5 px-3 py-3 font-display text-xs font-bold uppercase tracking-wider text-paper/80"
          >
            Simular: coincide
          </button>
          <button
            type="button"
            onClick={() => simulate('clone')}
            className="flex-1 border-2 border-paper/40 bg-paper/5 px-3 py-3 font-display text-xs font-bold uppercase tracking-wider text-paper/80"
          >
            Simular: clonado
          </button>
        </div>
      </div>
    </div>
  );
}
