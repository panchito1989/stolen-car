/**
 * ShieldCar — Vista de Verificación Pública (street-level).
 *
 * Server component. Cualquiera escanea el QR del certificado y aterriza aquí
 * con el sello en la URL. Objetivo: veredicto infalible en 2 segundos, alto
 * contraste para leerse a pleno sol, sin exponer PII del vendedor.
 */

import Link from 'next/link';
import {
  BadgeCheck,
  OctagonAlert,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from 'lucide-react';
import { resolvePublicCertificate } from '@/lib/verify/mock-registry';
import {
  sanitizeForPublicView,
  type PublicCertificateView,
} from '@/lib/verify/sanitizer';
import type { Verdict } from '@/types/shieldcar';

export const metadata = {
  title: 'ShieldCar — Verificación pública',
};

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ seal: string }>;
}) {
  const { seal } = await params;
  const certificate = await resolvePublicCertificate(seal);

  // Sello inexistente o revocado → alerta máxima.
  if (!certificate || certificate.status !== 'SEALED') {
    return <InvalidScreen seal={seal} revoked={certificate?.status === 'VOIDED'} />;
  }

  const view = sanitizeForPublicView(certificate);
  return <ValidScreen view={view} />;
}

// ---------------------------------------------------------------------------
// Pantalla de documento inválido / revocado
// ---------------------------------------------------------------------------

function InvalidScreen({ seal, revoked }: { seal: string; revoked: boolean }) {
  return (
    <main className="flex min-h-dvh flex-col bg-rojo text-paper">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <ShieldX className="size-20" strokeWidth={2} aria-hidden />
        <h1 className="mt-4 font-display text-4xl font-bold uppercase leading-none tracking-tight">
          {revoked ? 'Documento revocado' : 'Documento inválido'}
        </h1>
        <p className="mt-4 text-lg font-medium leading-snug">
          {revoked
            ? 'Este certificado fue ANULADO y ya no es válido. No completes la compra con este documento.'
            : 'No existe ningún certificado ShieldCar con este sello. Puede ser una falsificación.'}
        </p>
        <div className="mt-6 border-2 border-paper/40 bg-black/10 px-3 py-2">
          <p className="font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-paper/70">
            Sello consultado
          </p>
          <p className="mt-0.5 break-all font-mono text-xs">{seal}</p>
        </div>
        <p className="mt-6 font-display text-sm font-bold uppercase tracking-wider">
          ⚠ No entregues dinero ni firmes nada.
        </p>
      </div>
      <PublicFooter dark />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Pantalla de certificado válido (street-level)
// ---------------------------------------------------------------------------

const BANNER_STYLE: Record<Verdict, string> = {
  ok: 'bg-verde text-paper',
  warning: 'bg-ambar text-ink',
  fail: 'bg-rojo text-paper',
  unavailable: 'bg-gris text-paper',
};

function BannerIcon({ verdict }: { verdict: Verdict }) {
  const Icon =
    verdict === 'ok' ? BadgeCheck : verdict === 'fail' ? OctagonAlert : TriangleAlert;
  return <Icon className="size-14 shrink-0" strokeWidth={2.25} aria-hidden />;
}

function ValidScreen({ view }: { view: PublicCertificateView }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-paper px-4 pb-8 pt-5">
      {/* Membrete */}
      <div className="flex items-center justify-between border-b-2 border-ink pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6" strokeWidth={2.25} aria-hidden />
          <span className="font-display text-xl font-bold uppercase tracking-tight">
            ShieldCar
          </span>
        </div>
        <span className="border border-ink bg-card px-2 py-0.5 font-mono text-[0.6rem] uppercase text-gris">
          Verificación pública
        </span>
      </div>

      {/* Banner gigante del veredicto vehicular */}
      <section
        className={`mt-5 flex items-center gap-3 border-2 border-ink px-4 py-5 ${BANNER_STYLE[view.vehicle.verdict]}`}
      >
        <BannerIcon verdict={view.vehicle.verdict} />
        <div>
          <p className="font-display text-[0.7rem] font-bold uppercase tracking-[0.25em] opacity-80">
            Estado del vehículo
          </p>
          <p className="font-display text-4xl font-bold uppercase leading-none tracking-tight">
            {view.vehicle.label}
          </p>
        </div>
      </section>

      {/* NIV enmascarado para comparar en el parabrisas */}
      <section className="mt-4 border-2 border-ink bg-card px-4 py-3">
        <p className="font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris">
          NIV (compáralo en el parabrisas)
        </p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-[0.15em]">
          {view.maskedVin}
        </p>
        <p className="mt-1 text-xs text-gris">
          Solo mostramos los últimos 4 caracteres por privacidad. Deben
          coincidir con los del vehículo.
        </p>
      </section>

      {/* Vendedor sanitizado */}
      <section className="mt-4 border-2 border-ink bg-card px-4 py-3">
        <p className="font-display text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gris">
          Vendedor
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="font-display text-2xl font-bold uppercase tracking-tight">
            {view.identity.displayName}
          </p>
          <span
            className={`flex items-center gap-1 border-2 px-2 py-0.5 font-display text-[0.65rem] font-bold uppercase tracking-wider ${
              view.identity.verdict === 'ok'
                ? 'border-verde text-verde'
                : view.identity.verdict === 'fail'
                  ? 'border-rojo text-rojo'
                  : 'border-ambar text-ambar'
            }`}
          >
            {view.identity.label}
          </span>
        </div>
        <p className="mt-1 text-xs text-gris">
          Identidad validada contra INE / Lista Nominal. No exponemos datos
          personales del vendedor.
        </p>
      </section>

      {/* Sello criptográfico al pie */}
      <section className="mt-4 border-2 border-ink bg-ink px-4 py-3 text-paper">
        <p className="font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-paper/60">
          Sello criptográfico verificado · {formatUtc(view.seal.sealedAtUtc)}
        </p>
        <p className="mt-1 break-all font-mono text-[0.7rem] leading-tight">
          {view.seal.hash}
        </p>
      </section>

      <PublicFooter />
    </main>
  );
}

function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

function PublicFooter({ dark = false }: { dark?: boolean }) {
  return (
    <footer className="mt-auto pt-8">
      <p
        className={`pt-3 text-center font-mono text-[0.6rem] uppercase tracking-widest ${
          dark ? 'text-paper/60' : 'border-t border-ink/20 text-gris'
        }`}
      >
        <Link href="/" className="underline-offset-2 hover:underline">
          ShieldCar
        </Link>{' '}
        · Blindaje de compraventa vehicular
      </p>
    </footer>
  );
}
