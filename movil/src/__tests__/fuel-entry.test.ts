import { describe, expect, it } from '@jest/globals';

import { efficiencyEquivalents } from '@/src/lib/fuel';
import { LITERS_PER_GALLON, toLiters, validateFuelEntry } from '@/src/lib/fuel-entry';

const now = new Date(2026, 10, 2, 9, 0).getTime();
const base = { odometerKm: 48_000, amount: 40, total: 2_600, date: '2026-11-02', previousOdometerKm: 47_500, electric: false, now };

describe('RF-09: registro de combustible', () => {
  it('acepta un registro válido y guarda la fecha', () => {
    const result = validateFuelEntry(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(new Date(result.filledAt).getTime()).toBe(now);
    const past = validateFuelEntry({ ...base, date: '2026-10-28' });
    expect(past.ok && new Date(past.filledAt).getDate()).toBe(28);
  });

  it('rechaza un odómetro menor que el anterior', () => {
    expect(validateFuelEntry({ ...base, odometerKm: 47_499 })).toEqual({
      ok: false,
      error: 'El odómetro no puede ser menor que el registro anterior.',
    });
  });

  it('rechaza cantidades negativas o cero', () => {
    expect(validateFuelEntry({ ...base, amount: -5 }).ok).toBe(false);
    expect(validateFuelEntry({ ...base, total: -1 }).ok).toBe(false);
    expect(validateFuelEntry({ ...base, odometerKm: -10 }).ok).toBe(false);
  });

  it('rechaza fechas futuras o mal escritas', () => {
    expect(validateFuelEntry({ ...base, date: '2026-11-03' }).ok).toBe(false);
    expect(validateFuelEntry({ ...base, date: '02/11/2026' }).ok).toBe(false);
    expect(validateFuelEntry({ ...base, date: '2026-02-30' }).ok).toBe(false);
  });

  it('convierte galones a litros', () => {
    expect(toLiters(10, 'gal')).toBeCloseTo(10 * LITERS_PER_GALLON, 6);
    expect(toLiters(10, 'L')).toBe(10);
  });

  it('calcula km/L, L/100 km y MPG', () => {
    const figures = efficiencyEquivalents(12.5);
    expect(figures.lPer100km).toBeCloseTo(8, 6);
    expect(figures.mpg).toBeCloseTo(29.4, 1);
    expect(efficiencyEquivalents(0)).toEqual({ kmPerL: 0, lPer100km: 0, mpg: 0 });
  });
});
