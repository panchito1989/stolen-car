/**
 * ShieldCar — Cliente Supabase de servidor (solo backend).
 *
 * Regla de resiliencia: si las variables de entorno no están configuradas
 * (desarrollo local offline), devolvemos `null` y el llamador sigue sin
 * persistencia — el flujo del reporte NUNCA se rompe por falta de base.
 *
 * Usa la service_role key: salta RLS y por eso este módulo jamás debe
 * importarse desde un componente cliente.
 */

import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '@/lib/db/repository';

let warned = false;

export function getServerDb(): DbClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (!warned) {
      warned = true;
      console.warn(
        '[ShieldCar] Supabase sin configurar (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY): los reportes NO se persistirán. Modo offline OK para desarrollo.',
      );
    }
    return null;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // El cliente real satisface el contrato estructural del repositorio;
  // el cast queda encapsulado en esta única frontera.
  return client as unknown as DbClient;
}
