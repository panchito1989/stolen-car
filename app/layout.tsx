import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const body = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
});

const condensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-condensed',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-plexmono',
});

export const metadata: Metadata = {
  title: 'ShieldCar — Verificación de NIV',
  description:
    'Blindaje para compraventa de autos y motos entre particulares: valida el NIV antes de arriesgar tu dinero.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Evita el zoom automático de iOS al enfocar el campo del NIV.
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <body
        className={`${body.variable} ${condensed.variable} ${plexMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
