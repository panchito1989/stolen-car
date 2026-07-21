/**
 * ShieldCar — Código QR del sello maestro.
 *
 * Apunta dinámicamente a la vista de verificación pública. La URL base sale
 * de NEXT_PUBLIC_APP_URL (producción) y cae a localhost en desarrollo. Server
 * component: QRCodeSVG genera el SVG de forma determinista, sin JS de cliente.
 */

import { QRCodeSVG } from 'qrcode.react';

export function verifyUrl(masterSealHash: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/verify/${masterSealHash}`;
}

export default function SealQrCode({
  masterSealHash,
  size = 80,
  /** Colores explícitos para máxima legibilidad sobre fondo tinta. */
  fgColor = '#1c1810',
  bgColor = '#f4f0e6',
  className,
}: {
  masterSealHash: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  className?: string;
}) {
  const url = verifyUrl(masterSealHash);
  return (
    <div className={className}>
      <QRCodeSVG
        value={url}
        size={size}
        // 'M' tolera ~15% de daño: sobrevive a un celular sucio o mal foco.
        level="M"
        fgColor={fgColor}
        bgColor={bgColor}
        marginSize={2}
        title="Escanea para verificar este certificado en ShieldCar"
      />
    </div>
  );
}
