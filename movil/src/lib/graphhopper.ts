import type { WorldMapRoute } from '@/src/lib/map-html';
import { haversineMeters } from '@/src/lib/geo';
import { fetchWithTimeout } from '@/src/lib/network';
import { instructionsFromGraphHopper, instructionsFromOsrm } from '@/src/lib/route-instructions';
import { compactRouteCoordinates } from '@/src/lib/route-geometry';

const GRAPHHOPPER_URL = (process.env.EXPO_PUBLIC_GRAPHHOPPER_URL ?? '').replace(/\/+$/, '');
const GRAPHHOPPER_API_KEY = process.env.EXPO_PUBLIC_GRAPHHOPPER_API_KEY ?? '';
const GRAPHHOPPER_PROFILE = process.env.EXPO_PUBLIC_GRAPHHOPPER_PROFILE ?? 'car';

export const graphHopperProfile = GRAPHHOPPER_PROFILE;
export const isGraphHopperConfigured = Boolean(GRAPHHOPPER_URL || GRAPHHOPPER_API_KEY);

type GeoPoint = {
  latitude: number;
  longitude: number;
};

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
    instructions?: {
      text?: string;
      distance?: number;
      sign?: number;
      interval?: [number, number];
      street_name?: string;
    }[];
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
    'instructions=true',
    'calc_points=true',
    'locale=es',
  ];

  if (!GRAPHHOPPER_URL && GRAPHHOPPER_API_KEY) {
    params.push(`key=${encodeURIComponent(GRAPHHOPPER_API_KEY)}`);
  }

  const response = await fetchWithTimeout(`${base}?${params.join('&')}`, {
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

  const instructions = instructionsFromGraphHopper(path.instructions ?? [], coordinates);
  return {
    coordinates: compactRouteCoordinates(coordinates),
    distanceM: path.distance,
    timeMs: path.time,
    source: 'graphhopper',
    instructions,
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
    legs?: {
      steps?: {
        distance: number;
        name?: string;
        maneuver?: {
          type?: string;
          modifier?: string;
          exit?: number;
        };
      }[];
    }[];
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
  const url = `${OSRM_URL}/route/v1/driving/${encodeURIComponent(path)}?overview=full&geometries=geojson&steps=true&alternatives=false&continue_straight=false`;

  const response = await fetchWithTimeout(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
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
    coordinates: compactRouteCoordinates(coordinates),
    distanceM: route.distance,
    timeMs: route.duration * 1000,
    source: 'osrm',
    instructions: instructionsFromOsrm(
      route.legs?.flatMap((leg) => leg.steps ?? []) ?? [],
    ),
  };
}

// GraphHopper primero y OSRM público como respaldo. Nunca se devuelve una
// línea directa como si fuera una ruta segura para conducir.
export async function fetchStreetRoute({
  origin,
  destination,
  signal,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  signal?: AbortSignal;
}): Promise<WorldMapRoute> {
  let lastError: unknown = null;
  if (isGraphHopperConfigured) {
    try {
      return await fetchGraphHopperRoute({ origin, destination, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  try {
    return await fetchOsrmRoute({ origin, destination, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    lastError = error;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('No encontramos una calle transitable entre esos puntos.');
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
