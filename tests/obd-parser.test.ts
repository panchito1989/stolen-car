import { describe, expect, test } from 'vitest';
import { parseVinFromObd } from '@/lib/vehicle/obd-parser';

// NIV de prueba (Nissan México). En OBD Modo 09 PID 02, el NIV viaja como
// ASCII en hex, precedido por el marcador de respuesta "49 02 01".
const VIN = '3N1AB7AP0KY000000';

describe('parseVinFromObd', () => {
  test('parses the ELM327 line-numbered multiframe format', () => {
    // Formato típico del ELM327 (ya reensamblado por el adaptador):
    const raw = [
      '014',
      '0: 49 02 01 33 4E 31',
      '1: 41 42 37 41 50 30 4B',
      '2: 59 30 30 30 30 30 30',
    ].join('\r');
    const r = parseVinFromObd(raw);
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('parses a continuous hex string containing the 490201 marker', () => {
    const raw =
      'SEARCHING...\r490201334E314142374150304B59303030303030\r>';
    const r = parseVinFromObd(raw);
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('parses raw CAN ISO-TP frames with 7E8 headers', () => {
    // Con headers activados (ATH1): cada línea trae el CAN ID 7E8 y los
    // bytes de control ISO-TP (10 14 = first frame; 21/22 = consecutive).
    const raw = [
      '7E8 10 14 49 02 01 33 4E 31',
      '7E8 21 41 42 37 41 50 30 4B',
      '7E8 22 59 30 30 30 30 30 30',
    ].join('\r');
    const r = parseVinFromObd(raw);
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('tolerates lowercase and extra whitespace/prompt noise', () => {
    const raw = '  49 02 01 33 4e 31 41 42 37 41 50 30 4b 59 30 30 30 30 30 30  \r\n>';
    const r = parseVinFromObd(raw);
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('returns an error when the ECU responds NO DATA', () => {
    const r = parseVinFromObd('SEARCHING...\rNO DATA\r>');
    expect(r.valid).toBe(false);
    expect(r.vin).toBeNull();
    expect(r.error).toMatch(/no respondió|no data|computadora/i);
  });

  test('returns an error for UNABLE TO CONNECT', () => {
    const r = parseVinFromObd('UNABLE TO CONNECT\r>');
    expect(r.valid).toBe(false);
    expect(r.error).toBeTruthy();
  });

  test('returns an error when no 490201 marker is present', () => {
    const r = parseVinFromObd('41 0C 1A F8\r>'); // respuesta de RPM, no VIN
    expect(r.valid).toBe(false);
    expect(r.vin).toBeNull();
  });

  test('rejects a decoded string that is not a valid 17-char VIN', () => {
    // 490201 seguido de bytes que decodifican a algo con caracteres inválidos.
    const raw = '49 02 01 49 4F 51 20 20 20 20 20 20 20 20 20 20 20 20 20 20';
    const r = parseVinFromObd(raw);
    expect(r.valid).toBe(false);
  });

  test('empty input is invalid', () => {
    expect(parseVinFromObd('').valid).toBe(false);
  });
});
