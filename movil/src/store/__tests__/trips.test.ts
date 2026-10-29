import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { saveBackgroundBatch } from '@/src/lib/background-points';
import { resetTripDetection, useTrips } from '@/src/store/trips';

jest.mock('@react-native-async-storage/async-storage', () =>
  // jest.mock se eleva antes de los imports: aquí solo funciona require.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const LAT = 18.4861;
const LNG = -69.9312;
// ~111 m por cada 0,001° de latitud.
const north = (steps: number) => LAT + steps * 0.001;

function drive(from: number, samples: number, startAt: number, stepMs = 15_000) {
  const record = useTrips.getState().recordPoint;
  for (let index = 0; index < samples; index += 1) {
    record({ latitude: north(from + index), longitude: LNG, speedKmh: 30, at: startAt + index * stepMs });
  }
}

describe('registro automático de rutas', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    await AsyncStorage.clear();
    resetTripDetection();
    useTrips.setState({
      active: null,
      trips: [],
      totals: { drives: 0, distanceM: 0, durationMs: 0 },
      hydrated: true,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('descarta el viaje breve al llevar 90 s parado aunque no cambie el promedio', () => {
    const start = Date.now();
    const record = useTrips.getState().recordPoint;
    for (let index = 0; index < 3; index += 1) {
      record({ latitude: LAT, longitude: LNG, speedKmh: 20, at: start + index * 2_500 });
    }
    expect(useTrips.getState().active).not.toBeNull();

    record({ latitude: LAT, longitude: LNG, speedKmh: 0, at: start + 10_000 });
    record({ latitude: LAT, longitude: LNG, speedKmh: 0, at: start + 105_000 });

    expect(useTrips.getState().active).toBeNull();
    expect(useTrips.getState().trips).toHaveLength(0);
  });

  it('ignora muestras repetidas o anteriores a la última', () => {
    const start = Date.now();
    drive(0, 5, start);
    const before = useTrips.getState().active;

    drive(0, 5, start);

    expect(useTrips.getState().active).toBe(before);
  });

  it('cierra el viaje donde se perdió la señal si pasan más de 10 min sin muestras', () => {
    const start = Date.now();
    drive(0, 6, start);
    const lastAt = start + 5 * 15_000;

    drive(50, 1, lastAt + 30 * 60_000);

    const [ended] = useTrips.getState().trips;
    expect(ended.endedAt).toBe(lastAt);
    expect(ended.distanceM).toBeGreaterThan(400);
    expect(useTrips.getState().active).toBeNull();
  });

  it('recupera un viaje grabado en segundo plano con la app cerrada', async () => {
    const start = Date.now() - 60 * 60_000;
    const points = Array.from({ length: 8 }, (_, index) => ({
      latitude: north(index),
      longitude: LNG,
      // Sin velocidad: se deriva de la distancia entre fixes.
      speedKmh: null,
      at: start + index * 15_000,
    }));
    await saveBackgroundBatch(points.slice(0, 4));
    await saveBackgroundBatch(points.slice(4));
    useTrips.setState({ hydrated: false });

    await useTrips.getState().hydrate();

    const { trips, active } = useTrips.getState();
    expect(active).toBeNull();
    expect(trips).toHaveLength(1);
    expect(trips[0].startedAt).toBe(points[1].at);
    expect(trips[0].distanceM).toBeGreaterThan(600);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.some((key) => key.includes('bg-points'))).toBe(false);
  });

  it('al volver de segundo plano no pierde los puntos pendientes por un fix en vivo', async () => {
    const start = Date.now() - 20 * 60_000;
    const background = Array.from({ length: 6 }, (_, index) => ({
      latitude: north(index),
      longitude: LNG,
      speedKmh: 30,
      at: start + index * 15_000,
    }));
    await saveBackgroundBatch(background);

    const { blockLive, recordPoint, ingestBackground } = useTrips.getState();
    blockLive();
    // El GPS en vivo responde antes que la recogida de lotes.
    recordPoint({ latitude: north(40), longitude: LNG, speedKmh: 30 });
    await ingestBackground();

    const active = useTrips.getState().active;
    expect(active?.startedAt).toBe(background[0].at);
    expect(active?.distanceM).toBeGreaterThan(400);
  });

  it('los totales cuentan todos los viajes aunque el historial guarde solo 30', async () => {
    const old = Array.from({ length: 30 }, (_, index) => ({
      id: `old${index}`,
      startedAt: index,
      endedAt: index + 1,
      distanceM: 1_000,
      maxSpeedKmh: 0,
      avgSpeedKmh: 0,
      points: [],
    }));
    useTrips.setState({ trips: old, totals: { drives: 30, distanceM: 30_000, durationMs: 30 } });

    drive(0, 6, Date.now());
    await useTrips.getState().stopTrip();

    const { trips, totals } = useTrips.getState();
    expect(trips).toHaveLength(30);
    expect(totals.drives).toBe(31);
    expect(totals.distanceM).toBeGreaterThan(30_400);
  });
});
