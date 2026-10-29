import AsyncStorage from '@react-native-async-storage/async-storage';

import { haversineMeters } from '@/src/lib/geo';

export type BackgroundPoint = {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  at: number;
};

// Cada lote del servicio de fondo va en su propia clave: el task nunca
// reescribe lo ya guardado y la app borra exactamente lo que leyó, sin perder
// puntos que lleguen mientras tanto.
const BATCH_PREFIX = 'caravana.bg-points.';
// Formatos de versiones anteriores que pueden tener puntos sin fusionar.
const LEGACY_QUEUE_KEY = 'caravana.pending.points.v1';
const LEGACY_SESSION_KEY = 'caravana.tracking.session';
// Por encima de esto la velocidad derivada entre dos fixes no es fiable.
const MAX_DERIVE_GAP_MS = 120_000;

type LegacySessionPoint = {
  latitude: number;
  longitude: number;
  speed: number | null;
  timestamp: number;
};

export async function saveBackgroundBatch(points: BackgroundPoint[]) {
  if (points.length === 0) return;
  const suffix = Math.random().toString(36).slice(2, 8);
  await AsyncStorage.setItem(`${BATCH_PREFIX}${points[0].at}-${suffix}`, JSON.stringify(points));
}

function isValidPoint(point: BackgroundPoint) {
  return (
    Number.isFinite(point?.latitude) &&
    Number.isFinite(point?.longitude) &&
    Number.isFinite(point?.at)
  );
}

function parseStored(key: string, raw: string): BackgroundPoint[] {
  const value = JSON.parse(raw) as unknown;
  if (key === LEGACY_SESSION_KEY) {
    const legacy = (value as { points?: LegacySessionPoint[] } | null)?.points;
    if (!Array.isArray(legacy)) return [];
    return legacy.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      speedKmh: point.speed != null && point.speed >= 0 ? point.speed * 3.6 : null,
      at: point.timestamp,
    }));
  }
  return Array.isArray(value) ? (value as BackgroundPoint[]) : [];
}

// Algunos fixes de fondo llegan sin velocidad; sin ella el grabador los
// trataría como "parado" y cortaría el viaje.
function withDerivedSpeed(points: BackgroundPoint[]) {
  return points.map((point, index) => {
    if (point.speedKmh != null || index === 0) return point;
    const previous = points[index - 1];
    const elapsedMs = point.at - previous.at;
    if (elapsedMs < 1_000 || elapsedMs > MAX_DERIVE_GAP_MS) return point;
    return { ...point, speedKmh: (haversineMeters(previous, point) / elapsedMs) * 3_600 };
  });
}

// Devuelve, ordenados por tiempo, todos los puntos grabados en segundo plano
// y los borra del almacenamiento.
export async function drainBackgroundPoints(): Promise<BackgroundPoint[]> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(
      (key) =>
        key.startsWith(BATCH_PREFIX) || key === LEGACY_QUEUE_KEY || key === LEGACY_SESSION_KEY,
    );
    if (keys.length === 0) return [];

    const points: BackgroundPoint[] = [];
    for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
      if (!raw) continue;
      try {
        points.push(...parseStored(key, raw).filter(isValidPoint));
      } catch {
        // Un lote corrupto no debe bloquear los demás.
      }
    }
    await AsyncStorage.multiRemove(keys);

    points.sort((a, b) => a.at - b.at);
    return withDerivedSpeed(points);
  } catch {
    return [];
  }
}
