import { describe, expect, test } from 'vitest';
import {
  decideKycVerdict,
  validateCic,
  validateClaveElector,
  validateCurp,
  validateOcr,
} from '@/lib/identity/validators';

// ---------------------------------------------------------------------------
// CURP — estructura oficial RENAPO de 18 caracteres + dígito verificador
// (algoritmo base-37). Vectores calculados con el algoritmo oficial.
// ---------------------------------------------------------------------------

describe('validateCurp', () => {
  test('accepts a valid CURP (pre-2000, homoclave numérica)', () => {
    const r = validateCurp('PEGJ850315HDFLRN05');
    expect(r.valid).toBe(true);
    expect(r.verdict).toBe('ok');
  });

  test('accepts a valid CURP (mujer, Jalisco)', () => {
    expect(validateCurp('GAOM920611MJCRRS05').valid).toBe(true);
  });

  test('accepts a valid CURP (nacido en 2001, homoclave alfabética)', () => {
    expect(validateCurp('LOHA010203HNENRRA1').valid).toBe(true);
  });

  test('normalizes lowercase and surrounding spaces', () => {
    const r = validateCurp('  pegj850315hdflrn05 ');
    expect(r.valid).toBe(true);
    expect(r.curp).toBe('PEGJ850315HDFLRN05');
  });

  test('rejects a CURP with wrong check digit (posible OCR o falsificación)', () => {
    const r = validateCurp('PEGJ850315HDFLRN09');
    expect(r.valid).toBe(false);
    expect(r.verdict).toBe('fail');
    expect(r.reason).toMatch(/verificador/i);
  });

  test('rejects an invalid state code', () => {
    expect(validateCurp('PEGJ850315HXXLRN05').valid).toBe(false);
  });

  test('rejects an impossible birth date (month 13)', () => {
    expect(validateCurp('PEGJ851315HDFLRN05').valid).toBe(false);
  });

  test('rejects wrong length', () => {
    expect(validateCurp('PEGJ850315HDF').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Clave de elector — 18 caracteres: 6 consonantes + fecha (6) + estado (2)
// + sexo (1) + consecutivo (3)
// ---------------------------------------------------------------------------

describe('validateClaveElector', () => {
  test('accepts a well-formed clave de elector', () => {
    const r = validateClaveElector('GMVLMR80070109M100');
    expect(r.valid).toBe(true);
  });

  test('normalizes lowercase input', () => {
    expect(validateClaveElector('gmvlmr80070109m100').valid).toBe(true);
  });

  test('rejects an invalid state code (33 no existe)', () => {
    expect(validateClaveElector('GMVLMR80070133M100').valid).toBe(false);
  });

  test('rejects wrong structure (letters where digits belong)', () => {
    expect(validateClaveElector('GMVLMR8007010XM100').valid).toBe(false);
  });

  test('rejects wrong length', () => {
    expect(validateClaveElector('GMVLMR80070109M10').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CIC (9 dígitos, modelos D en adelante) y OCR (13 dígitos, modelos A–C)
// ---------------------------------------------------------------------------

describe('validateCic / validateOcr', () => {
  test('CIC accepts exactly 9 digits', () => {
    expect(validateCic('123456789').valid).toBe(true);
    expect(validateCic('12345678').valid).toBe(false);
    expect(validateCic('12345678A').valid).toBe(false);
  });

  test('OCR accepts exactly 13 digits', () => {
    expect(validateOcr('1234567890123').valid).toBe(true);
    expect(validateOcr('123456789012').valid).toBe(false);
    expect(validateOcr('12345678901234').valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decideKycVerdict — reglas del dictamen de identidad
// ---------------------------------------------------------------------------

describe('decideKycVerdict', () => {
  const base = {
    curpValid: true,
    claveElectorValid: true,
    vigente: true,
    documentIntact: true,
    faceMatchScore: 97,
    livenessPassed: true,
  };

  test('everything clean → VERIFIED', () => {
    const d = decideKycVerdict(base);
    expect(d.verdict).toBe('VERIFIED');
    expect(d.reasons).toHaveLength(0);
  });

  test('tampered document → REJECTED regardless of biometrics', () => {
    const d = decideKycVerdict({ ...base, documentIntact: false });
    expect(d.verdict).toBe('REJECTED');
    expect(d.reasons.join(' ')).toMatch(/alterad/i);
  });

  test('invalid CURP → REJECTED', () => {
    expect(decideKycVerdict({ ...base, curpValid: false }).verdict).toBe(
      'REJECTED',
    );
  });

  test('face match below 40 → REJECTED (suplantación)', () => {
    const d = decideKycVerdict({ ...base, faceMatchScore: 31 });
    expect(d.verdict).toBe('REJECTED');
  });

  test('expired credential → MANUAL_REVIEW, not outright rejection', () => {
    const d = decideKycVerdict({ ...base, vigente: false });
    expect(d.verdict).toBe('MANUAL_REVIEW');
    expect(d.reasons.join(' ')).toMatch(/vigencia|vencid/i);
  });

  test('ambiguous face match (40–84) → MANUAL_REVIEW', () => {
    expect(decideKycVerdict({ ...base, faceMatchScore: 60 }).verdict).toBe(
      'MANUAL_REVIEW',
    );
  });

  test('failed liveness → REJECTED (foto de una foto)', () => {
    expect(decideKycVerdict({ ...base, livenessPassed: false }).verdict).toBe(
      'REJECTED',
    );
  });
});
