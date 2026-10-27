import type { WorldMapRoute } from '@/src/lib/map-html';

const GRAPHHOPPER_URL = (process.env.EXPO_PUBLIC_GRAPHHOPPER_URL ?? '').replace(/\/+$/, '');
const GRAPHHOPPER_API_KEY = process.env.EXPO_PUBLIC_GRAPHHOPPER_API_KEY ?? '';
const GRAPHHOPPER_PROFILE = process.env.EXPO_PUBLIC_GRAPHHOPPER_PROFILE ?? 'car';

export const graphHopperProfile = GRAPHHOPPER_PROFILE;
export const isGraphHopperConfigured = Boolean(GRAPHHOPPER_URL || GRAPHHOPPER_API_KEY);

type GeoPoint = {
  latitude: number;
  longitude: number;
};

function haversineMeters(a: GeoPoint, b: GeoPoint) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function fallbackRoute(origin: GeoPoint, destination: GeoPoint): WorldMapRoute {
  const direct = haversineMeters(origin, destination);
  // Aproximación conservadora para una ruta por carretera sin motor de ruteo.
  const distanceM = direct * 1.25;
  const averageSpeedMps = 50_000 / 3600;

  return {
    coordinates: [
      [origin.latitude, origin.longitude],
      [destination.latitude, destination.longitude],
    ],
    distanceM,
    timeMs: distanceM > 0 ? (distanceM / averageSpeedMps) * 1000 : 0,
    source: 'fallback',
  };
}

type GraphHopperResponse = {
  paths?: {
    distance: number;
    time: number;
    points: {
      coordinates: [number, number][];
    };
  }[];
  message?: string;
};

export async function fetchGraphHopperRoute({
  origin,
  destination,
  signal,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  signal?: AbortSignal;
}): Promise<WorldMapRoute> {
  if (!isGraphHopperConfigured) {
    throw new Error('GraphHopper no está configurado.');
  }

  const base = GRAPHHOPPER_URL
    ? GRAPHHOPPER_URL.endsWith('/route')
      ? GRAPHHOPPER_URL
      : `${GRAPHHOPPER_URL}/route`
    : 'https://graphhopper.com/api/1/route';

  const params = [
    `point=${origin.latitude},${origin.longitude}`,
    `point=${destination.latitude},${destination.longitude}`,
    `profile=${encodeURIComponent(GRAPHHOPPER_PROFILE)}`,
    'points_encoded=false',
    'instructions=false',
    'calc_points=true',
    'locale=es',
  ];

  if (!GRAPHHOPPER_URL && GRAPHHOPPER_API_KEY) {
    params.push(`key=${encodeURIComponent(GRAPHHOPPER_API_KEY)}`);
  }

  const response = await fetch(`${base}?${params.join('&')}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  const data = (await response.json()) as GraphHopperResponse;
  if (!response.ok || !data.paths?.[0]) {
    throw new Error(data.message || 'GraphHopper no devolvió una ruta válida.');
  }

  const path = data.paths[0];
  const coordinates = path.points.coordinates
    .filter(
      (coordinate): coordinate is [number, number] =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    )
    .map(([longitude, latitude]) => [latitude, longitude] as [number, number]);

  if (coordinates.length < 2) {
    throw new Error('GraphHopper devolvió una ruta vacía.');
  }

  return {
    coordinates,
    distanceM: path.distance,
    timeMs: path.time,
    source: 'graphhopper',
  };
}

type OsrmResponse = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: {
      coordinates: [number, number][];
    };
  }[];
};

// Servidor público de demostración de OSRM: rutas reales por calle sin API key.
// Para producción conviene GraphHopper propio o un OSRM hospedado.
const OSRM_URL = 'https://router.project-osrm.org';

export async function fetchOsrmRoute({
  origin,
  destination,
  signal,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  signal?: AbortSignal;
}): Promise<WorldMapRoute> {
  const path = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = `${OSRM_URL}/route/v1/driving/${encodeURIComponent(path)}?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  const data = (await response.json()) as OsrmResponse;
  const route = data.routes?.[0];
  if (!response.ok || !route) {
    throw new Error(data.code ? `OSRM respondió ${data.code}.` : 'OSRM no devolvió una ruta válida.');
  }

  const coordinates = (route.geometry?.coordinates ?? [])
    .filter(
      (coordinate): coordinate is [number, number] =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    )
    .map(([longitude, latitude]) => [latitude, longitude] as [number, number]);

  if (coordinates.length < 2) {
    throw new Error('OSRM devolvió una ruta vacía.');
  }

  return {
    coordinates,
    distanceM: route.distance,
    timeMs: route.duration * 1000,
    source: 'osrm',
  };
}

// GraphHopper primero, luego OSRM público y, al final, línea directa.
export async function fetchStreetRoute({
  origin,
  destination,
  signal,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  signal?: AbortSignal;
}): Promise<WorldMapRoute> {
  if (isGraphHopperConfigured) {
    try {
      return await fetchGraphHopperRoute({ origin, destination, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  try {
    return await fetchOsrmRoute({ origin, destination, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return fallbackRoute(origin, destination);
}

export function formatRouteDistance(distanceM: number) {
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

export function formatRouteTime(timeMs: number) {
  const minutes = Math.max(1, Math.round(timeMs / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h ${rest} min`;
}
