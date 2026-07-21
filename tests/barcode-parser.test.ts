import { describe, expect, test } from 'vitest';
import {
  parseVinFromBarcode,
  vinsMatch,
} from '@/lib/vehicle/barcode-parser';

const VIN = '3N1AB7AP0KY000000'; // Nissan México, check digit '0' válido

describe('parseVinFromBarcode', () => {
  test('extracts a clean 17-char VIN', () => {
    const r = parseVinFromBarcode(VIN);
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('strips Code39 start/stop asterisks', () => {
    const r = parseVinFromBarcode('*3N1AB7AP0KY000000*');
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('handles surrounding whitespace and lowercase (noisy scan)', () => {
    const r = parseVinFromBarcode(' *3n1ab7ap0ky000000* ');
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('extracts the VIN from a labeled string like "VIN: ..."', () => {
    const r = parseVinFromBarcode('VIN: 3N1AB7AP0KY000000');
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('ignores separators embedded by some scanners', () => {
    const r = parseVinFromBarcode('3N1-AB7-AP0-KY0-00000');
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('rejects a scan with no 17-char VIN candidate', () => {
    const r = parseVinFromBarcode('*ABC123*');
    expect(r.valid).toBe(false);
    expect(r.vin).toBeNull();
    expect(r.error).toBeTruthy();
  });

  test('rejects a 17-char North American VIN with a bad check digit', () => {
    // Real VIN with last digit altered → check digit no longer matches.
    const r = parseVinFromBarcode('*3N1AB7AP0KY000009*');
    expect(r.valid).toBe(false);
    expect(r.vin).toBeNull();
    expect(r.error).toMatch(/verificador|check/i);
  });

  test('never returns a candidate containing I, O or Q', () => {
    // A blob with forbidden letters embedded; the only clean window is the VIN.
    const r = parseVinFromBarcode('QIO3N1AB7AP0KY000000OIQ');
    expect(r.valid).toBe(true);
    expect(r.vin).toBe(VIN);
  });

  test('empty input is invalid', () => {
    expect(parseVinFromBarcode('').valid).toBe(false);
  });
});

describe('vinsMatch', () => {
  test('matches identical VINs regardless of case/spacing', () => {
    expect(vinsMatch('3N1AB7AP0KY000000', ' 3n1ab7ap0ky000000 ')).toBe(true);
  });

  test('does not match different VINs', () => {
    expect(vinsMatch('3N1AB7AP0KY000000', '1HGCM82633A004352')).toBe(false);
  });

  test('does not match when one side is empty', () => {
    expect(vinsMatch('', '3N1AB7AP0KY000000')).toBe(false);
  });
});
