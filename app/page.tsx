import { ShieldCheck } from 'lucide-react';
import VinInput from '@/components/VinInput';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-6">
      {/* Membrete del expediente */}
      <header className="border-b-4 border-ink pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-8" strokeWidth={2.25} aria-hidden />
          <span className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
            ShieldCar
          </span>
        </div>
        <p className="mt-2 font-display text-sm font-semibold uppercase tracking-[0.25em] text-gris">
          Expediente de verificación vehicular
        </p>
      </header>

      {/* Paso actual */}
      <div className="mt-6 flex items-baseline justify-between">
        <h1 className="font-display text-xl font-bold uppercase tracking-wide">
          Paso 1 · Identifica el vehículo
        </h1>
        <span className="border border-ink bg-card px-2 py-0.5 font-mono text-[0.65rem] uppercase text-gris">
          Sin costo
        </span>
      </div>
      <p className="mt-1 text-sm leading-snug text-gris">
        Antes de consultar REPUVE, adeudos o la factura ante el SAT,
        validamos que el NIV sea real y no esté alterado.
      </p>

      <div className="mt-6">
        <VinInput />
      </div>

      {/* Pie del dictamen */}
      <footer className="mt-auto pt-10">
        <p className="border-t border-ink/20 pt-3 text-center font-mono text-[0.65rem] uppercase tracking-widest text-gris">
          Validación offline · ISO 3779 · Ningún dato sale de tu teléfono
        </p>
      </footer>
    </main>
  );
}
