import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Los builds de verificación usan un distDir separado (.next-build) para no
  // pisar los chunks del dev server, que corre sobre `.next`. El script
  // `verify` exporta SHIELDCAR_BUILD=1. La PWA (Serwist) se agrega en Fase 0.
  distDir: process.env.SHIELDCAR_BUILD ? '.next-build' : '.next',
};

export default nextConfig;
