import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type TripPoint = {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  at: number;
};

export type Trip = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  distanceM: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  points: TripPoint[];
  recordsSubmitted?: boolean;
};

type TripsState = {
  trips: Trip[];
  active: Trip | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  recordPoint: (input: {
    latitude: number;
    longitude: number;
    speedKmh: number | null;
    at?: number;
  }) => void;
  stopTrip: () => Promise<void>;
  markRecordsSubmitted: (tripId: string) => void;
};

const ARCHIVE_KEY = 'caravana.trips.v1';
const ACTIVE_KEY = 'caravana.active-trip.v1';
const MAX_TRIPS = 30;
const MAX_POINTS = 700;
// Solo se graba al conducir: 15 km/h sostenidos en varias muestras. Así una
// caminata (o un pico de ruido del GPS) nunca abre una ruta.
const MOVE_START_KMH = 15;
const START_CONFIRM_SAMPLES = 3;
const MIN_RECORD_KMH = 8;
const STOP_AFTER_MS = 2 * 60_000;
const MIN_POINT_DISTANCE_M = 15;
const PERSIST_EVERY_MS = 12_000;

let lastMovingAt = 0;
let lastPersistAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let fastSamples = 0;
let pendingStart: TripPoint | null = null;

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// El viaje activo se guarda solo (pocos KB) cada 12 s; el archivo completo
// (hasta 30 rutas) solo cuando un viaje termina. Así no reescribimos ~1 MB de
// JSON en plena conducción.
async function persistActive() {
  lastPersistAt = Date.now();
  try {
    const { active } = useTrips.getState();
    if (active) await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    else await AsyncStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Si el almacenamiento falla, la siguiente escritura reintenta.
  }
}

async function persistArchive() {
  try {
    const { trips } = useTrips.getState();
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify({ trips }));
  } catch {
    // Se reintenta al terminar el siguiente viaje.
  }
}

async function persistAll() {
  lastPersistAt = Date.now();
  await Promise.all([persistActive(), persistArchive()]);
}

function schedulePersist() {
  if (persistTimer) return;
  const wait = Math.max(0, PERSIST_EVERY_MS - (Date.now() - lastPersistAt));
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistActive();
  }, wait);
}

function finishTrip(trip: Trip, now: number): Trip {
  const endedAt = now;
  const hours = (endedAt - trip.startedAt) / 3_600_000;
  const avgSpeedKmh =
    hours > 0 ? Math.min(200, Math.round((trip.distanceM / 1000 / hours) * 10) / 10) : 0;
  return { ...trip, endedAt, avgSpeedKmh };
}

// Grabación local de rutas: vive en el dispositivo, sobrevive sin conexión y
// en segundo plano (los puntos del servicio de fondo se fusionan al abrir).
export const useTrips = create<TripsState>((set, get) => ({
  trips: [],
  active: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [rawArchive, rawActive] = await Promise.all([
        AsyncStorage.getItem(ARCHIVE_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
      ]);

      let trips: Trip[] = [];
      let active: Trip | null = null;

      if (rawArchive) {
        const parsed = JSON.parse(rawArchive) as { trips?: Trip[]; active?: Trip | null };
        if (Array.isArray(parsed.trips)) trips = parsed.trips;
        // Compatibilidad con la versión anterior que guardaba el viaje activo aquí.
        if (!rawActive && parsed.active) active = parsed.active;
      }
      if (rawActive) {
        active = JSON.parse(rawActive) as Trip | null;
      }

      set({ trips, active, hydrated: true });
      if (active) {
        const last = active.points[active.points.length - 1];
        lastMovingAt = last?.at ?? active.startedAt;
      }
      return;
    } catch {
      // Almacenamiento corrupto: empezamos vacío.
    }
    set({ hydrated: true });
  },

  recordPoint: ({ latitude, longitude, speedKmh, at }) => {
    const now = at ?? Date.now();
    const speed =
      speedKmh != null && Number.isFinite(speedKmh) && speedKmh >= 0 ? speedKmh : 0;
    const { active } = get();

    if (!active) {
      if (speed < MOVE_START_KMH) {
        fastSamples = 0;
        pendingStart = null;
        return;
      }

      // Confirmamos movimiento de coche con varias muestras seguidas antes de
      // empezar a grabar; el viaje arranca en la primera muestra rápida.
      if (!pendingStart) {
        pendingStart = { latitude, longitude, speedKmh: speed, at: now };
        fastSamples = 0;
      }
      fastSamples += 1;
      if (fastSamples < START_CONFIRM_SAMPLES) return;

      const startPoint = pendingStart;
      fastSamples = 0;
      pendingStart = null;

      const trip: Trip = {
        id: `t_${startPoint.at.toString(36)}`,
        startedAt: startPoint.at,
        endedAt: null,
        distanceM: 0,
        maxSpeedKmh: Math.max(startPoint.speedKmh ?? speed, speed),
        avgSpeedKmh: speed,
        points: [startPoint],
      };
      lastMovingAt = now;
      set({ active: trip });
      schedulePersist();
      return;
    }

    const previous = active.points[active.points.length - 1];
    const segmentM = previous ? haversineMeters(previous, { latitude, longitude }) : 0;
    // Solo se acumulan puntos en movimiento de coche (>= 8 km/h): caminar
    // después de aparcar no ensucia la ruta.
    const driving = speed >= MIN_RECORD_KMH;
    if (driving) lastMovingAt = now;

    const nextPoints =
      driving && segmentM >= MIN_POINT_DISTANCE_M
        ? [...active.points, { latitude, longitude, speedKmh: speed, at: now }]
        : active.points;
    const points =
      nextPoints.length > MAX_POINTS
        ? nextPoints.filter((_, index) => index % 2 === 0)
        : nextPoints;

    const hours = (now - active.startedAt) / 3_600_000;
    const distanceM = active.distanceM + (driving ? segmentM : 0);
    const next: Trip = {
      ...active,
      points,
      distanceM,
      maxSpeedKmh: Math.max(active.maxSpeedKmh, speed),
      avgSpeedKmh:
        hours > 0 ? Math.min(200, Math.round((distanceM / 1000 / hours) * 10) / 10) : active.avgSpeedKmh,
    };

    if (!driving && now - lastMovingAt > STOP_AFTER_MS && next.distanceM > 200) {
      const ended = finishTrip(next, now);
      set({ active: null, trips: [ended, ...get().trips].slice(0, MAX_TRIPS) });
      void persistAll();
      return;
    }

    set({ active: next });
    schedulePersist();
  },

  stopTrip: async () => {
    const active = get().active;
    if (!active) return;
    const ended = finishTrip(active, Date.now());
    set({ active: null, trips: [ended, ...get().trips].slice(0, MAX_TRIPS) });
    await persistAll();
  },

  markRecordsSubmitted: (tripId) => {
    const patch = (trip: Trip) =>
      trip.id === tripId ? { ...trip, recordsSubmitted: true } : trip;
    set({
      trips: get().trips.map(patch),
      active: get().active ? patch(get().active as Trip) : null,
    });
    void persistArchive();
  },
}));
