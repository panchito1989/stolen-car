/**
 * POST /api/verify/match
 *
 * Body: { seal: string; vin: string }
 *
 * Compara el NIV escaneado en campo contra el NIV REAL del certificado
 * sellado — la comparación ocurre en el servidor para preservar el modelo
 * zero-knowledge: el NIV completo del expediente NUNCA se envía al cliente.
 * Solo regresa un booleano.
 */

import { NextResponse } from 'next/server';
import { parseVinFromBarcode, vinsMatch } from '@/lib/vehicle/barcode-parser';
import { resolvePublicCertificate } from '@/lib/verify/mock-registry';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const { seal, vin } = (body ?? {}) as { seal?: unknown; vin?: unknown };
  if (typeof seal !== 'string' || typeof vin !== 'string') {
    return NextResponse.json(
      { error: 'Faltan `seal` o `vin`.' },
      { status: 400 },
    );
  }

  const certificate = await resolvePublicCertificate(seal);
  if (!certificate || certificate.status !== 'SEALED') {
    return NextResponse.json(
      { error: 'Certificado no válido o revocado.' },
      { status: 404 },
    );
  }

  // Aceptamos tanto un NIV limpio como una lectura cruda de código de barras.
  const parsed = parseVinFromBarcode(vin);
  const scanned = parsed.valid && parsed.vin ? parsed.vin : vin;

  const match = vinsMatch(certificate.vehicleReport.vin, scanned);
  return NextResponse.json({ match });
}
