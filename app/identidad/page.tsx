import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import KycStepper from '@/components/identity/KycStepper';

export const metadata = {
  title: 'ShieldCar — Verificación de identidad',
};

export default function IdentidadPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-10 pt-6">
      <header className="border-b-4 border-ink pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-8" strokeWidth={2.25} aria-hidden />
          <span className="font-display text-3xl font-bold uppercase leading-none tracking-tight">
            ShieldCar
          </span>
        </div>
        <p className="mt-2 font-display text-sm font-semibold uppercase tracking-[0.25em] text-gris">
          Módulo de identidad · KYC
        </p>
      </header>

      <div className="mt-4 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-1 font-display text-xs font-bold uppercase tracking-wider text-gris underline-offset-2 hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Volver al vehículo
        </Link>
        <span className="border border-ink bg-card px-2 py-0.5 font-mono text-[0.65rem] uppercase text-gris">
          Fase 2
        </span>
      </div>

      <p className="mt-3 text-sm leading-snug text-gris">
        Verificamos que quien vende (o compra) sea quien dice ser: INE
        auténtica y vigente, y su rostro en vivo contra la foto de la
        credencial.
      </p>

      <div className="mt-6">
        <KycStepper />
      </div>

      <footer className="mt-auto pt-10">
        <p className="border-t border-ink/20 pt-3 text-center font-mono text-[0.65rem] uppercase tracking-widest text-gris">
          Biometría con prueba de vida · Datos protegidos (LFPDPPP)
        </p>
      </footer>
    </main>
  );
}
