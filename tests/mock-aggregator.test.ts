import { describe, expect, test } from 'vitest';
import { MockVehicleProvider } from '@/lib/providers/vehicle/mock-aggregator';

const CLEAN_VIN = '3N1AB7AP5KY000000';

function makeProvider(
  scenario?: 'clean' | 'stolen' | 'debts' | 'fake_invoice' | 'unavailable',
) {
  // delayMs: 0 keeps the suite fast; production default simulates latency.
  return new MockVehicleProvider({ scenario, delayMs: 0 });
}

describe('MockVehicleProvider — contract', () => {
  test('exposes a provider name and implements the pure methods', () => {
    const p = makeProvider();
    expect(p.name).toBe('mock');
    expect(p.validateVinCheckDigit('11111111111111111').valid).toBe(true);
    expect(p.decodeWmi(CLEAN_VIN).region).toBe('north_america');
  });

  test('every result carries provider, rawPayload and ISO checkedAt', async () => {
    const p = makeProvider('clean');
    const r = await p.checkRepuve({ vin: CLEAN_VIN });
    expect(r.provider).toBe('mock');
    expect(r.rawPayload).toBeDefined();
    expect(new Date(r.checkedAt).toISOString()).toBe(r.checkedAt);
  });
});

describe('MockVehicleProvider — scenarios', () => {
  test('clean: all four checks come back ok', async () => {
    const p = makeProvider('clean');
    const [repuve, theft, debts, cfdi] = await Promise.all([
      p.checkRepuve({ vin: CLEAN_VIN }),
      p.checkTheftReport({ vin: CLEAN_VIN }),
      p.checkDebts({ plate: 'ABC123D', state: 'CDMX' }),
      p.checkSatCfdi({
        uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
        rfcEmisor: 'NIS9807293G1',
        rfcReceptor: 'XAXX010101000',
      }),
    ]);
    expect(repuve.verdict).toBe('ok');
    expect(theft.verdict).toBe('ok');
    expect(debts.verdict).toBe('ok');
    expect(cfdi.verdict).toBe('ok');
  });

  test('stolen: theft report fails while invoice may still look valid', async () => {
    const p = makeProvider('stolen');
    const theft = await p.checkTheftReport({ vin: CLEAN_VIN });
    expect(theft.verdict).toBe('fail');
    expect(theft.summary.length).toBeGreaterThan(0);
  });

  test('debts: adeudos come back as warning (money owed, not a crime)', async () => {
    const p = makeProvider('debts');
    const debts = await p.checkDebts({ plate: 'ABC123D', state: 'EDOMEX' });
    expect(debts.verdict).toBe('warning');
  });

  test('fake_invoice: SAT CFDI validation fails', async () => {
    const p = makeProvider('fake_invoice');
    const cfdi = await p.checkSatCfdi({
      uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
      rfcEmisor: 'NIS9807293G1',
      rfcReceptor: 'XAXX010101000',
    });
    expect(cfdi.verdict).toBe('fail');
  });

  test('unavailable: sources report unavailable instead of throwing', async () => {
    const p = makeProvider('unavailable');
    const repuve = await p.checkRepuve({ vin: CLEAN_VIN });
    expect(repuve.verdict).toBe('unavailable');
    // rawPayload must still exist so the audit_log has something to hash.
    expect(repuve.rawPayload).toBeDefined();
  });

  test('defaults to the clean scenario', async () => {
    const p = makeProvider();
    const repuve = await p.checkRepuve({ vin: CLEAN_VIN });
    expect(repuve.verdict).toBe('ok');
  });
});
