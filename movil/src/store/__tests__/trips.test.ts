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

  it('descarta el viaje breve al llevar 10 min parado aunque no cambie el promedio', () => {
    const start = Date.now();
    const record = useTrips.getState().recordPoint;
    for (let index = 0; index < 3; index += 1) {
      record({ latitude: LAT, longitude: LNG, speedKmh: 20, at: start + index * 2_500 });
    }
    expect(useTrips.getState().active).not.toBeNull();

    record({ latitude: LAT, longitude: LNG, speedKmh: 0, at: start + 10_000 });
    record({ latitude: LAT, longitude: LNG, speedKmh: 0, at: start + 105_000 });
    // 90 s parado ya no corta el viaje: puede ser un tapón.
    expect(useTrips.getState().active).not.toBeNull();

    record({ latitude: LAT, longitude: LNG, speedKmh: 0, at: start + 11 * 60_000 });
    expect(useTrips.getState().active).toBeNull();
    expect(useTrips.getState().trips).toHaveLength(0);
  });

  it('un tapón de varios minutos no parte el viaje en dos', () => {
    const start = Date.now();
    const record = useTrips.getState().recordPoint;
    let at = start;
    let lat = LAT;
    const step = (speedKmh: number, seconds: number) => {
      for (let s = 0; s < seconds; s += 5) {
        at += 5_000;
        lat += (speedKmh / 3.6) * 5 * 0.000009;
        record({ latitude: lat, longitude: LNG, speedKmh, at });
      }
    };
    step(40, 120);
    const tripId = useTrips.getState().active?.id;
    expect(tripId).toBeDefined();
    step(0, 240);
    step(5, 30);
    step(0, 180);
    step(40, 120);

    expect(useTrips.getState().active?.id).toBe(tripId);
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

  it('guarda distancia, tiempo, media y máxima de un viaje con tapón', async () => {
    const start = Date.now();
    const record = useTrips.getState().recordPoint;
    let at = start;
    let lat = LAT;
    const step = (speedKmh: number, seconds: number) => {
      for (let s = 0; s < seconds; s += 5) {
        at += 5_000;
        lat += (speedKmh / 3.6) * 5 * 0.000009;
        record({ latitude: lat, longitude: LNG, speedKmh, at });
      }
    };
    step(40, 60); // ~660 m
    step(0, 180); // tapón de 3 min
    step(6, 30);
    step(72, 60); // ~1,2 km a 72 km/h
    const lastDrivingAt = at;
    step(4, 60); // caminando tras aparcar: no suma
    await useTrips.getState().stopTrip();

    const [trip] = useTrips.getState().trips;
    expect(trip).toBeDefined();
    expect(trip.distanceM).toBeGreaterThan(1_700);
    expect(trip.distanceM).toBeLessThan(2_000);
    expect(trip.maxSpeedKmh).toBe(72);
    // Termina en el último punto en coche, no al terminar de caminar.
    expect(trip.endedAt).toBe(lastDrivingAt);
    const minutes = ((trip.endedAt ?? 0) - trip.startedAt) / 60_000;
    expect(minutes).toBeGreaterThan(5);
    expect(minutes).toBeLessThan(6.5);
    // Media real con el tapón incluido: ~20 km/h.
    expect(trip.avgSpeedKmh).toBeGreaterThan(15);
    expect(trip.avgSpeedKmh).toBeLessThan(25);
    expect(useTrips.getState().totals.drives).toBe(1);
  });

  it('los viajes de prueba se ven, no suman y se borran', async () => {
    const start = Date.now();
    const record = useTrips.getState().recordPoint;
    for (let index = 0; index < 20; index += 1) {
      record({
        latitude: north(index * 0.1),
        longitude: LNG,
        speedKmh: 50,
        at: start + index * 5_000,
        test: true,
      });
    }
    expect(useTrips.getState().active?.test).toBe(true);
    await useTrips.getState().stopTrip();

    expect(useTrips.getState().trips).toHaveLength(1);
    expect(useTrips.getState().trips[0].test).toBe(true);
    expect(useTrips.getState().totals.drives).toBe(0);

    await useTrips.getState().removeTestTrips();
    expect(useTrips.getState().trips).toHaveLength(0);
  });

  it('un viaje real y uno de prueba nunca se mezclan', () => {
    const start = Date.now();
    drive(0, 6, start, 5_000);
    const realId = useTrips.getState().active?.id;
    expect(useTrips.getState().active?.test).toBeUndefined();

    const record = useTrips.getState().recordPoint;
    for (let index = 0; index < 4; index += 1) {
      record({
        latitude: north(10 + index),
        longitude: LNG,
        speedKmh: 40,
        at: start + 60_000 + index * 5_000,
        test: true,
      });
    }
    const { trips, active, totals } = useTrips.getState();
    expect(trips[0]?.id).toBe(realId);
    expect(trips[0]?.test).toBeUndefined();
    expect(totals.drives).toBe(1);
    expect(active?.test).toBe(true);
  });

  it('un viaje de prueba no desplaza los 30 reales', () => {
    const real = Array.from({ length: 30 }, (_, index) => ({
      id: `r${index}`,
      startedAt: Date.now() - (index + 1) * 3_600_000,
      endedAt: Date.now() - (index + 1) * 3_600_000 + 600_000,
      distanceM: 1_000,
      maxSpeedKmh: 50,
      avgSpeedKmh: 30,
      points: [],
    }));
    useTrips.setState({ trips: real });
    const start = Date.now();
    const record = useTrips.getState().recordPoint;
    for (let index = 0; index < 20; index += 1) {
      record({
        latitude: north(index * 0.1),
        longitude: LNG,
        speedKmh: 50,
        at: start + index * 5_000,
        test: true,
      });
    }
    void useTrips.getState().stopTrip();
    const trips = useTrips.getState().trips;
    expect(trips).toHaveLength(31);
    expect(trips.filter((trip) => !trip.test)).toHaveLength(30);
  });

  it('los puntos reales de segundo plano no cortan un viaje de prueba', async () => {
    const start = Date.now();
    const record = useTrips.getState().recordPoint;
    for (let index = 0; index < 6; index += 1) {
      record({
        latitude: north(index),
        longitude: LNG,
        speedKmh: 50,
        at: start + index * 5_000,
        test: true,
      });
    }
    const testId = useTrips.getState().active?.id;
    // Lote del GPS real (parado en casa) que llega al volver a primer plano.
    await saveBackgroundBatch([
      { latitude: LAT, longitude: LNG, speedKmh: 0, at: start + 31_000 },
      { latitude: LAT, longitude: LNG, speedKmh: 0, at: start + 32_000 },
    ]);
    await useTrips.getState().ingestBackground();
    for (let index = 6; index < 10; index += 1) {
      record({
        latitude: north(index),
        longitude: LNG,
        speedKmh: 50,
        at: start + 30_000 + index * 5_000,
        test: true,
      });
    }

    expect(useTrips.getState().active?.id).toBe(testId);
    expect(useTrips.getState().trips).toHaveLength(0);
  });
});
