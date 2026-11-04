import { describe, expect, it, jest } from '@jest/globals';

import { plausibleSpeed, useTrips } from '@/src/store/trips';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Fallos de un viaje real en la tableta (2026-11-04): el viaje no se cerraba
// al aparcar y la máxima marcaba un pico del GPS.
describe('cierre del viaje sin posiciones nuevas', () => {
  it('se cierra tras 10 min parado aunque no llegue ninguna muestra', async () => {
    // Hasta cargar lo guardado, el GPS en vivo no se acepta.
    await useTrips.getState().hydrate();
    const start = Date.now() + 60_000;
    const store = useTrips.getState();
    // Un viaje real: 3 km en línea recta a ~50 km/h, una muestra cada 4 s.
    for (let i = 0; i <= 60; i += 1) {
      store.recordPoint({ latitude: 18.45 + i * 0.0005, longitude: -69.93, speedKmh: 50, at: start + i * 4_000 });
    }
    expect(useTrips.getState().active).not.toBeNull();
    const parkedAt = start + 60 * 4_000;

    // Aparcado: el GPS ya no manda nada. A los 5 min sigue abierto…
    useTrips.getState().closeIfIdle(parkedAt + 5 * 60_000);
    expect(useTrips.getState().active).not.toBeNull();

    // …y a los 11 min se cierra, terminando cuando dejó de moverse.
    useTrips.getState().closeIfIdle(parkedAt + 11 * 60_000);
    expect(useTrips.getState().active).toBeNull();
    const trip = useTrips.getState().trips[0];
    expect(trip?.endedAt).toBeLessThanOrEqual(parkedAt);
  });
});

describe('velocidad máxima creíble', () => {
  const previous = { latitude: 18.45, longitude: -69.93, speedKmh: 40, at: 0 };

  it('un pico que no cuadra con la distancia no cuenta', () => {
    // 4 s y ~55 m (≈ 50 km/h): un 123 km/h del GPS se queda en lo creíble.
    const value = plausibleSpeed(123, previous, 18.4505, -69.93, 4_000);
    expect(value).toBeLessThan(90);
  });

  it('una velocidad real se respeta', () => {
    expect(plausibleSpeed(48, previous, 18.4505, -69.93, 4_000)).toBe(48);
  });
});
