import { describe, expect, it } from '@jest/globals';

import { arrivedAtDestination } from '@/src/lib/arrival';
import { cumulativeDistances, routeProgress, snappedPosition } from '@/src/lib/route-instructions';

// Viaje real en la tableta (2026-11-04): «nunca dijo llegaste a tu destino» y
// el coche «se volaba calles».
describe('llegada al destino', () => {
  const base = { remainingRouteM: null, offRouteM: null, stopped: false };

  it('a menos de 50 m llega aunque vaya en marcha', () => {
    expect(arrivedAtDestination({ ...base, distanceM: 45 })).toBe(true);
  });

  it('aparcado a 90 m del punto exacto también llega (antes no)', () => {
    expect(arrivedAtDestination({ ...base, distanceM: 90 })).toBe(false);
    expect(arrivedAtDestination({ ...base, distanceM: 90, stopped: true })).toBe(true);
  });

  it('parado en un semáforo lejos no cuenta como llegada', () => {
    expect(arrivedAtDestination({ ...base, distanceM: 600, remainingRouteM: 700, offRouteM: 5, stopped: true })).toBe(false);
  });

  it('al final de la ruta llega aunque el destino quede algo más lejos', () => {
    expect(arrivedAtDestination({ distanceM: 80, remainingRouteM: 20, offRouteM: 10, stopped: false })).toBe(true);
  });
});

describe('coche pegado a la ruta (MAPA-06)', () => {
  // Calle recta hacia el norte.
  const route: [number, number][] = [
    [18.45, -69.93],
    [18.46, -69.93],
  ];
  const cumulative = cumulativeDistances(route);

  it('a 20 m de la calle se dibuja sobre la calle', () => {
    const gps = { latitude: 18.455, longitude: -69.93 + 20 / 105_600, accuracy: 15 };
    const snapped = snappedPosition(gps, routeProgress(route, cumulative, gps));
    expect(snapped).not.toBeNull();
    expect(snapped?.longitude).toBeCloseTo(-69.93, 6);
    expect(snapped?.latitude).toBeCloseTo(18.455, 4);
  });

  it('a 80 m (te saliste) o con GPS muy malo se dibuja la posición real', () => {
    const far = { latitude: 18.455, longitude: -69.93 + 80 / 105_600, accuracy: 15 };
    expect(snappedPosition(far, routeProgress(route, cumulative, far))).toBeNull();
    const bad = { latitude: 18.455, longitude: -69.93, accuracy: 120 };
    expect(snappedPosition(bad, routeProgress(route, cumulative, bad))).toBeNull();
  });
});
