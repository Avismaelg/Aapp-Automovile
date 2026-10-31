import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { drainBackgroundPoints } from '@/src/lib/background-points';
import { haversineMeters } from '@/src/lib/geo';

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
  // Grabado desde el simulador: no cuenta en totales ni récords y se borra
  // al parar la simulación.
  test?: boolean;
};

// Totales de toda la vida del dispositivo: el historial solo guarda los
// últimos MAX_TRIPS viajes.
export type TripTotals = {
  drives: number;
  distanceM: number;
  durationMs: number;
};

type TripsState = {
  trips: Trip[];
  totals: TripTotals;
  active: Trip | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  ingestBackground: () => Promise<void>;
  blockLive: () => void;
  recordPoint: (input: {
    latitude: number;
    longitude: number;
    speedKmh: number | null;
    at?: number;
    source?: 'live' | 'background';
    test?: boolean;
  }) => void;
  stopTrip: () => Promise<void>;
  removeTestTrips: () => Promise<void>;
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
// Parado este tiempo, el viaje se da por terminado. Es largo a propósito: en
// un tapón se puede estar varios minutos quieto sin haber aparcado (al bajar
// del coche el viaje se cierra antes, por el detector de aparcamiento).
const STOP_AFTER_MS = 10 * 60_000;
const MIN_TRIP_DISTANCE_M = 200;
// Sin ninguna muestra durante este tiempo (app cerrada, túnel, GPS apagado)
// el viaje se da por terminado donde se perdió la señal.
const STALE_TRIP_MS = 10 * 60_000;
const MIN_POINT_DISTANCE_M = 15;
const PERSIST_EVERY_MS = 12_000;

let lastMovingAt = 0;
let lastSampleAt = 0;
let lastPersistAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let fastSamples = 0;
let pendingStart: TripPoint | null = null;
// Mientras hay puntos de segundo plano sin recoger (al arrancar o al volver de
// segundo plano) se ignora el GPS en vivo: un fix nuevo haría que los puntos
// pendientes, más antiguos, se descartaran como repetidos.
let liveBlocked = true;

// Solo para tests: el estado de detección vive fuera del store.
export function resetTripDetection() {
  lastMovingAt = 0;
  lastSampleAt = 0;
  fastSamples = 0;
  pendingStart = null;
  liveBlocked = false;
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
    const { trips, totals } = useTrips.getState();
    await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify({ trips, totals }));
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

// Archiva el viaje si es una ruta real (no una maniobra de aparcamiento).
// Los viajes recuperados del segundo plano pueden ser anteriores a otros ya
// archivados, por eso se ordena por inicio.
function archiveTrip(
  state: { trips: Trip[]; totals: TripTotals },
  trip: Trip,
  endedAt: number,
): { trips: Trip[]; totals: TripTotals } {
  if (trip.distanceM < MIN_TRIP_DISTANCE_M) return { trips: state.trips, totals: state.totals };
  const finished = finishTrip(trip, endedAt);
  const sorted = [finished, ...state.trips].sort((a, b) => b.startedAt - a.startedAt);
  // Los viajes de prueba no ocupan sitio: nunca desplazan uno real.
  const real = sorted.filter((item) => !item.test).slice(0, MAX_TRIPS);
  const trips = sorted.filter((item) => item.test || real.includes(item));
  if (trip.test) return { trips, totals: state.totals };
  return {
    trips,
    totals: {
      drives: state.totals.drives + 1,
      distanceM: state.totals.distanceM + finished.distanceM,
      durationMs: state.totals.durationMs + (endedAt - finished.startedAt),
    },
  };
}

const EMPTY_TOTALS: TripTotals = { drives: 0, distanceM: 0, durationMs: 0 };

// Versiones anteriores no guardaban totales: se parte de los viajes guardados.
function totalsFromTrips(trips: Trip[]): TripTotals {
  return trips.reduce(
    (totals, trip) => ({
      drives: totals.drives + 1,
      distanceM: totals.distanceM + trip.distanceM,
      durationMs: totals.durationMs + ((trip.endedAt ?? trip.startedAt) - trip.startedAt),
    }),
    EMPTY_TOTALS,
  );
}

function lastPointAt(trip: Trip) {
  return trip.points[trip.points.length - 1]?.at ?? trip.startedAt;
}

// Grabación local de rutas: vive en el dispositivo, sobrevive sin conexión y
// en segundo plano (los puntos del servicio de fondo se fusionan al abrir).
export const useTrips = create<TripsState>((set, get) => ({
  trips: [],
  totals: EMPTY_TOTALS,
  active: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    let trips: Trip[] = [];
    let totals: TripTotals | null = null;
    let active: Trip | null = null;
    try {
      const [rawArchive, rawActive] = await Promise.all([
        AsyncStorage.getItem(ARCHIVE_KEY),
        AsyncStorage.getItem(ACTIVE_KEY),
      ]);

      if (rawArchive) {
        const parsed = JSON.parse(rawArchive) as {
          trips?: Trip[];
          totals?: TripTotals;
          active?: Trip | null;
        };
        if (Array.isArray(parsed.trips)) trips = parsed.trips;
        if (parsed.totals && Number.isFinite(parsed.totals.drives)) totals = parsed.totals;
        // Compatibilidad con la versión anterior que guardaba el viaje activo aquí.
        if (!rawActive && parsed.active) active = parsed.active;
      }
      if (rawActive) {
        active = JSON.parse(rawActive) as Trip | null;
      }
    } catch {
      // Almacenamiento corrupto: empezamos vacío.
    }

    if (active) {
      lastSampleAt = lastPointAt(active);
      lastMovingAt = lastSampleAt;
    }
    set({ trips, totals: totals ?? totalsFromTrips(trips), active, hydrated: true });
    liveBlocked = true;

    // Primero se fusiona lo grabado con la app cerrada: puede continuar el
    // viaje activo o contener viajes completos.
    await get().ingestBackground();

    // Si aun así quedó un viaje activo de una sesión anterior (app cerrada,
    // crash o un viaje corto que nunca se cerró), se archiva o se descarta.
    const current = get().active;
    if (current && Date.now() - lastPointAt(current) > STALE_TRIP_MS) {
      set({ active: null, ...archiveTrip(get(), current, lastPointAt(current)) });
      void persistAll();
    }
  },

  ingestBackground: async () => {
    const points = await drainBackgroundPoints();
    const { recordPoint } = get();
    for (const point of points) recordPoint({ ...point, source: 'background' });
    liveBlocked = false;
    if (points.length > 0) await persistAll();
  },

  blockLive: () => {
    liveBlocked = true;
  },

  recordPoint: ({ latitude, longitude, speedKmh, at, source = 'live', test = false }) => {
    if (source === 'live' && liveBlocked) return;
    const current = get().active;
    // Durante una simulación el servicio de fondo sigue mandando el GPS real:
    // esos puntos no deben cortar ni ensuciar el viaje de prueba.
    if (source === 'background' && current?.test) return;
    // Un viaje real y uno de prueba nunca se mezclan.
    if (current && Boolean(current.test) !== test) {
      set({ active: null, ...archiveTrip(get(), current, lastPointAt(current)) });
      void persistAll();
      fastSamples = 0;
      pendingStart = null;
    }
    const now = at ?? Date.now();
    // El GPS en primer plano y los lotes del servicio de fondo se solapan:
    // una muestra igual o anterior a la última ya está contada.
    if (now <= lastSampleAt) return;
    const gapMs = lastSampleAt ? now - lastSampleAt : 0;
    lastSampleAt = now;

    const speed =
      speedKmh != null && Number.isFinite(speedKmh) && speedKmh >= 0 ? speedKmh : 0;
    let { active } = get();

    if (gapMs > STALE_TRIP_MS) {
      fastSamples = 0;
      pendingStart = null;
      if (active) {
        set({ active: null, ...archiveTrip(get(), active, lastPointAt(active)) });
        void persistAll();
        active = null;
      }
    }

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
        ...(test ? { test: true } : null),
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
    const maxSpeedKmh = Math.max(active.maxSpeedKmh, speed);
    const avgSpeedKmh =
      hours > 0 ? Math.min(200, Math.round((distanceM / 1000 / hours) * 10) / 10) : active.avgSpeedKmh;

    if (!driving && now - lastMovingAt > STOP_AFTER_MS) {
      const ending = { ...active, points, distanceM, maxSpeedKmh };
      // Termina cuando dejó de moverse, no cuando nos damos cuenta.
      set({ active: null, ...archiveTrip(get(), ending, lastMovingAt) });
      void persistAll();
      return;
    }

    // Un fix GPS parado o demasiado cercano no cambia los datos visibles.
    // Evitamos publicar un nuevo estado Zustand y rerenderizar toda la pantalla.
    if (
      points === active.points &&
      distanceM === active.distanceM &&
      maxSpeedKmh === active.maxSpeedKmh &&
      avgSpeedKmh === active.avgSpeedKmh
    ) {
      return;
    }

    const next: Trip = {
      ...active,
      points,
      distanceM,
      maxSpeedKmh,
      avgSpeedKmh,
    };

    set({ active: next });
    schedulePersist();
  },

  stopTrip: async () => {
    const active = get().active;
    if (!active) return;
    // Termina en el último punto en coche: caminar después no suma tiempo.
    set({ active: null, ...archiveTrip(get(), active, lastPointAt(active)) });
    await persistAll();
  },

  removeTestTrips: async () => {
    const active = get().active;
    set({
      trips: get().trips.filter((trip) => !trip.test),
      active: active?.test ? null : active,
    });
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
