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

const STORAGE_KEY = 'caravana.trips.v1';
const MAX_TRIPS = 30;
const MAX_POINTS = 700;
const MOVE_START_KMH = 10;
const STILL_KMH = 2.5;
const STOP_AFTER_MS = 5 * 60_000;
const MIN_POINT_DISTANCE_M = 15;
const PERSIST_EVERY_MS = 8_000;

let lastMovingAt = 0;
let lastPersistAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

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

async function persist() {
  lastPersistAt = Date.now();
  try {
    const { trips, active } = useTrips.getState();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ trips, active }));
  } catch {
    // Si el almacenamiento falla, la siguiente escritura reintenta.
  }
}

function schedulePersist() {
  if (persistTimer) return;
  const wait = Math.max(0, PERSIST_EVERY_MS - (Date.now() - lastPersistAt));
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persist();
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
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as { trips?: Trip[]; active?: Trip | null };
        set({
          trips: Array.isArray(stored.trips) ? stored.trips : [],
          active: stored.active ?? null,
          hydrated: true,
        });
        const active = stored.active ?? null;
        if (active) {
          const last = active.points[active.points.length - 1];
          lastMovingAt = last?.at ?? active.startedAt;
        }
        return;
      }
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
      if (speed < MOVE_START_KMH) return;
      const trip: Trip = {
        id: `t_${now.toString(36)}`,
        startedAt: now,
        endedAt: null,
        distanceM: 0,
        maxSpeedKmh: speed,
        avgSpeedKmh: speed,
        points: [{ latitude, longitude, speedKmh: speed, at: now }],
      };
      lastMovingAt = now;
      set({ active: trip });
      schedulePersist();
      return;
    }

    const previous = active.points[active.points.length - 1];
    const segmentM = previous ? haversineMeters(previous, { latitude, longitude }) : 0;
    if (speed >= STILL_KMH) lastMovingAt = now;

    const nextPoints =
      segmentM >= MIN_POINT_DISTANCE_M
        ? [...active.points, { latitude, longitude, speedKmh: speed, at: now }]
        : active.points;
    const points =
      nextPoints.length > MAX_POINTS
        ? nextPoints.filter((_, index) => index % 2 === 0)
        : nextPoints;

    const hours = (now - active.startedAt) / 3_600_000;
    const distanceM = active.distanceM + segmentM;
    const next: Trip = {
      ...active,
      points,
      distanceM,
      maxSpeedKmh: Math.max(active.maxSpeedKmh, speed),
      avgSpeedKmh:
        hours > 0 ? Math.min(200, Math.round((distanceM / 1000 / hours) * 10) / 10) : active.avgSpeedKmh,
    };

    if (speed < STILL_KMH && now - lastMovingAt > STOP_AFTER_MS && next.distanceM > 200) {
      const ended = finishTrip(next, now);
      set({ active: null, trips: [ended, ...get().trips].slice(0, MAX_TRIPS) });
      void persist();
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
    await persist();
  },

  markRecordsSubmitted: (tripId) => {
    const patch = (trip: Trip) =>
      trip.id === tripId ? { ...trip, recordsSubmitted: true } : trip;
    set({
      trips: get().trips.map(patch),
      active: get().active ? patch(get().active as Trip) : null,
    });
    void persist();
  },
}));
