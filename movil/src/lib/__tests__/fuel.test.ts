import { describe, expect, it } from '@jest/globals';

import { efficiencyChangePercent, realEfficiencyHistory } from '@/src/lib/fuel';
import type { FuelLog } from '@/src/types/models';

function log(odometer: number, liters: number, extra: Partial<FuelLog> = {}): FuelLog {
  return {
    id: `l${odometer}`,
    vehicleId: 'v1',
    kind: 'fuel',
    date: '',
    station: '',
    liters,
    pricePerLiter: 1,
    total: liters,
    odometer,
    fullTank: true,
    ...extra,
  };
}

describe('consumo real', () => {
  it('calcula km/L entre repostajes consecutivos sin importar el orden', () => {
    const history = realEfficiencyHistory([log(1_400, 40), log(1_000, 30), log(1_850, 30)]);
    expect(history).toEqual([10, 15]);
  });

  it('usa kWh/100 km en eléctricos', () => {
    const ev = (odometer: number, kwh: number) =>
      log(odometer, 0, { kind: 'electric', kwh });
    expect(realEfficiencyHistory([ev(0, 10), ev(200, 30)])).toEqual([15]);
  });

  it('ignora repostajes parciales', () => {
    expect(realEfficiencyHistory([log(0, 30), log(300, 20, { fullTank: false })])).toEqual([]);
  });

  it('la variación es positiva cuando el consumo mejora', () => {
    expect(efficiencyChangePercent([10, 11], false)).toBeCloseTo(10);
    expect(efficiencyChangePercent([20, 18], true)).toBeCloseTo(10);
    expect(efficiencyChangePercent([10], false)).toBeNull();
  });
});
