import { describe, expect, test } from 'vitest';
import {
  demoSealHash,
  getDemoCertificate,
  resolvePublicCertificate,
  voidedDemoSealHash,
} from '@/lib/verify/mock-registry';

describe('mock certificate registry', () => {
  test('getDemoCertificate is stable: same combo → same seal (determinismo)', async () => {
    const a = await getDemoCertificate('clean', 'valid_ine');
    const b = await getDemoCertificate('clean', 'valid_ine');
    // Debe ser reproducible; si los timestamps vivos se colaran, fallaría.
    expect(a.masterSealHash).toBe(b.masterSealHash);
  });

  test('the demo seal resolves to a SEALED certificate', async () => {
    const seal = await demoSealHash();
    const cert = await resolvePublicCertificate(seal);
    expect(cert).not.toBeNull();
    expect(cert?.status).toBe('SEALED');
    expect(cert?.masterSealHash).toBe(seal);
  });

  test('the voided demo seal resolves as VOIDED', async () => {
    const seal = await voidedDemoSealHash();
    const cert = await resolvePublicCertificate(seal);
    expect(cert?.status).toBe('VOIDED');
  });

  test('an unknown seal resolves to null (documento inexistente)', async () => {
    expect(await resolvePublicCertificate('f'.repeat(64))).toBeNull();
  });

  test('a malformed seal resolves to null without touching the registry', async () => {
    expect(await resolvePublicCertificate('not-a-hash')).toBeNull();
  });
});
