import { describe, expect, it } from '@jest/globals';

import { spotFromTripEnd } from '@/src/lib/parking-detector';

const M = 1 / 111_320;
const LAT = 18.47;
const LNG = -69.93;
const T0 = Date.UTC(2026, 10, 2, 12);
const spot = { latitude: LAT, longitude: LNG, at: T0 };
const trip = (id: string, startLat: number, extra: object = {}) => ({
  id,
  startedAt: T0 + 600_000,
  endedAt: T0 + 1_800_000,
  points: [
    { latitude: startLat, longitude: LNG },
    { latitude: LAT + 8_000 * M, longitude: LNG },
  ],
  ...extra,
});

describe('el coche aparcado solo se mueve con viajes en tu coche', () => {
  it('un viaje que sale de tu coche lo deja donde termina', () => {
    const result = spotFromTripEnd(trip('a', LAT + 30 * M), spot, null, T0 + 2_000_000);
    expect(result.spot).toMatchObject({ latitude: LAT + 8_000 * M, longitude: LNG });
  });

  it('un viaje que empieza lejos del coche (taxi, de copiloto) no lo mueve', () => {
    const result = spotFromTripEnd(trip('b', LAT + 3_000 * M), spot, null, T0 + 2_000_000);
    expect(result).toEqual({ spot: null, seen: 'b' });
  });

  it('un viaje de prueba del simulador no lo mueve', () => {
    const result = spotFromTripEnd(trip('c', LAT, { test: true }), spot, null, T0 + 2_000_000);
    expect(result).toEqual({ spot: null, seen: 'c' });
  });

  it('un viaje cortado en un tapón (sigue en el vehículo sin andar) no aparca ahí', () => {
    const motion = [
      { type: 'vehicle' as const, transition: 'exit' as const, at: T0 + 1_700_000 },
      { type: 'still' as const, transition: 'enter' as const, at: T0 + 1_701_000 },
      { type: 'vehicle' as const, transition: 'enter' as const, at: T0 + 2_400_000 },
    ];
    const result = spotFromTripEnd(trip('e', LAT + 30 * M), spot, null, T0 + 2_500_000, motion);
    expect(result).toEqual({ spot: null, seen: 'e' });
    // Si después echó a andar, sí aparcó al final del viaje.
    const walked = [...motion.slice(0, 2), { type: 'foot' as const, transition: 'enter' as const, at: T0 + 1_900_000 }];
    expect(spotFromTripEnd(trip('f', LAT + 30 * M), spot, null, T0 + 2_500_000, walked).spot).not.toBeNull();
  });

  it('sin aparcamiento guardado, el final del viaje lo crea', () => {
    const result = spotFromTripEnd(trip('d', LAT + 3_000 * M), null, null, T0 + 2_000_000);
    expect(result.spot).not.toBeNull();
  });
});
