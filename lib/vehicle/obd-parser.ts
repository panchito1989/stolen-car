/**
 * ShieldCar — Parser del NIV leído por OBD-II (Modo 09 PID 02).
 *
 * La computadora del auto (ECU) guarda el NIV grabado de fábrica. Al enviar
 * el comando "0902" a un adaptador ELM327, la ECU responde con el NIV como
 * ASCII en hexadecimal, precedido del marcador de respuesta 49 02 01
 * (0x49 = 0x09+0x40 = respuesta al Modo 09; 02 = PID; 01 = número de datos).
 *
 * El formato de la respuesta varía según el adaptador y la configuración:
 *   - Formateado por el ELM327 (líneas "0:", "1:", "2:") — ya reensamblado.
 *   - Cadena continua con el marcador 490201.
 *   - Tramas CAN crudas con ISO-TP (headers 7E8, bytes de control 10/21/22).
 *
 * Este parser cubre los tres. Es la pieza determinista y probada del módulo;
 * la conexión Bluetooth vive en el componente de cliente (no se puede probar
 * sin hardware real).
 */

export interface ParsedObdVin {
  valid: boolean;
  vin: string | null;
  error?: string;
}

/** NIV válido: 17 caracteres alfanuméricos sin I, O ni Q. */
const VIN_CHARSET = /^[A-HJ-NPR-Z0-9]{17}$/;

/** Errores que el ELM327/ECU devuelve como texto cuando no hay lectura. */
const ELM_ERRORS = /NO DATA|UNABLE TO CONNECT|STOPPED|CAN ERROR|BUS INIT|ERROR/;

function hexToAscii(hex: string): string {
  let out = '';
  for (let i = 0; i + 2 <= hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

/** Busca el marcador 490201 y decodifica los 17 bytes de NIV que le siguen. */
function extractVinFromHex(hex: string): string | null {
  const marker = hex.indexOf('490201');
  if (marker === -1) return null;
  const vinHex = hex.slice(marker + 6, marker + 6 + 34); // 17 bytes = 34 hex
  if (vinHex.length < 34) return null;
  const vin = hexToAscii(vinHex).toUpperCase();
  return VIN_CHARSET.test(vin) ? vin : null;
}

/**
 * Estrategia A — formato ya reensamblado (líneas "N:" o cadena continua).
 * Quita los índices de línea del ELM327 y concatena todo el hex.
 */
function tryFormatted(lines: string[]): string | null {
  const hex = lines
    .map((l) => l.replace(/^[0-9A-F]+:\s*/, '')) // índice de línea "0:", "1:"
    .join(' ')
    .replace(/[^0-9A-F]/g, '');
  return extractVinFromHex(hex);
}

/**
 * Estrategia B — tramas CAN crudas con ISO-TP. Descarta el CAN ID (7E8) y los
 * bytes de control de cada trama antes de reensamblar el payload:
 *   - First Frame  (1X): 2 bytes de control (1X LL) → payload desde el byte 3.
 *   - Consecutive  (2X): 1 byte de control (2X)     → payload desde el byte 2.
 *   - Single Frame (0X): 1 byte de control (0X)      → payload desde el byte 2.
 */
function tryIsoTp(lines: string[]): string | null {
  let payload = '';
  for (const line of lines) {
    // Quita el CAN ID (3 hex para 11-bit como 7E8, hasta 8 para 29-bit) ANTES
    // de tokenizar, porque un ID de 3 nibbles desalinearía los bytes de 2.
    const body = line.trim().replace(/^[0-9A-F]{3,8}\s+/, '');
    const bytes = body.match(/[0-9A-F]{2}/g) ?? [];
    if (bytes.length === 0) continue;
    const pci = bytes[0] as string;
    const type = pci[0];
    if (type === '1') payload += bytes.slice(2).join('');
    else if (type === '2' || type === '0') payload += bytes.slice(1).join('');
    else payload += bytes.join('');
  }
  return extractVinFromHex(payload);
}

export function parseVinFromObd(raw: string): ParsedObdVin {
  if (!raw || raw.trim().length === 0) {
    return { valid: false, vin: null, error: 'La respuesta OBD-II está vacía.' };
  }

  const upper = raw.toUpperCase();
  const lines = upper
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== '>' && !l.startsWith('AT'));

  // La ECU o el adaptador reportaron que no hubo lectura.
  if (ELM_ERRORS.test(upper) && !upper.includes('490201')) {
    return {
      valid: false,
      vin: null,
      error:
        'La computadora del auto no respondió al NIV (NO DATA). Puede que el modelo no lo exponga por OBD-II; usa la lectura por cámara o captúralo a mano.',
    };
  }

  const vin = tryFormatted(lines) ?? tryIsoTp(lines);
  if (vin) return { valid: true, vin };

  return {
    valid: false,
    vin: null,
    error:
      'No se pudo leer un NIV válido de la computadora. Reintenta la conexión OBD-II.',
  };
}
