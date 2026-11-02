import type { WorldMapRoute } from '@/src/lib/map-html';
import { haversineMeters } from '@/src/lib/geo';
import { fetchWithTimeout } from '@/src/lib/network';
import { instructionsFromGraphHopper, instructionsFromOsrm } from '@/src/lib/route-instructions';
import { compactRouteCoordinates } from '@/src/lib/route-geometry';
import { formatDistance, getLanguage, t } from '@/src/i18n';
import { GRAPHHOPPER_TIMEOUT_MS, OSRM_TIMEOUT_MS, OSRM_URL } from '@/src/lib/providers';

const GRAPHHOPPER_URL = (process.env.EXPO_PUBLIC_GRAPHHOPPER_URL ?? '').replace(/\/+$/, '');
const GRAPHHOPPER_API_KEY = process.env.EXPO_PUBLIC_GRAPHHOPPER_API_KEY ?? '';
const GRAPHHOPPER_PROFILE = process.env.EXPO_PUBLIC_GRAPHHOPPER_PROFILE ?? 'car';

export const graphHopperProfile = GRAPHHOPPER_PROFILE;
export const isGraphHopperConfigured = Boolean(GRAPHHOPPER_URL || GRAPHHOPPER_API_KEY);

type GeoPoint = {
  latitude: number;
  longitude: number;
};

export function fallbackRoute(origin: GeoPoint, destination: GeoPoint, stops: GeoPoint[] = []): WorldMapRoute {
  const points = [origin, ...stops, destination];
  let direct = 0;
  for (let index = 1; index < points.length; index += 1) direct += haversineMeters(points[index - 1], points[index]);
  // Aproximación conservadora para una ruta por carretera sin motor de ruteo.
  const distanceM = direct * 1.25;
  const averageSpeedMps = 50_000 / 3600;

  return {
    coordinates: points.map((point) => [point.latitude, point.longitude] as [number, number]),
    distanceM,
    timeMs: distanceM > 0 ? (distanceM / averageSpeedMps) * 1000 : 0,
    source: 'fallback',
  };
}

type GraphHopperPath = {
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
};

type GraphHopperResponse = {
  paths?: GraphHopperPath[];
  message?: string;
};

// Hasta tres opciones por petición, como en los navegadores habituales.
const MAX_ROUTES = 3;

function validLatLng(coordinates: [number, number][] | undefined) {
  return (coordinates ?? [])
    .filter(
      (coordinate): coordinate is [number, number] =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        Number.isFinite(coordinate[0]) &&
        Number.isFinite(coordinate[1]),
    )
    .map(([longitude, latitude]) => [latitude, longitude] as [number, number]);
}

function routeFromGraphHopperPath(path: GraphHopperPath): WorldMapRoute | null {
  const coordinates = validLatLng(path.points?.coordinates);
  if (coordinates.length < 2) return null;
  return {
    coordinates: compactRouteCoordinates(coordinates),
    distanceM: path.distance,
    timeMs: path.time,
    source: 'graphhopper',
    instructions: instructionsFromGraphHopper(path.instructions ?? [], coordinates),
  };
}

// Parámetros de GraphHopper: salida, paradas en orden y destino. Con paradas
// no hay rutas alternativas (GraphHopper no las calcula con puntos de paso).
export function graphHopperParams(origin: GeoPoint, destination: GeoPoint, stops: GeoPoint[] = []) {
  const params = [origin, ...stops, destination].map(
    (point) => `point=${point.latitude},${point.longitude}`,
  );
  params.push(
    `profile=${encodeURIComponent(GRAPHHOPPER_PROFILE)}`,
    'points_encoded=false',
    'instructions=true',
    'calc_points=true',
    `locale=${getLanguage()}`,
  );
  if (stops.length === 0) {
    params.push('algorithm=alternative_route', `alternative_route.max_paths=${MAX_ROUTES}`);
  }
  return params;
}

export async function fetchGraphHopperRoutes({
  origin,
  destination,
  stops = [],
  signal,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  stops?: GeoPoint[];
  signal?: AbortSignal;
}): Promise<WorldMapRoute[]> {
  if (!isGraphHopperConfigured) {
    throw new Error(t('GraphHopper no está configurado.'));
  }

  const base = GRAPHHOPPER_URL
    ? GRAPHHOPPER_URL.endsWith('/route')
      ? GRAPHHOPPER_URL
      : `${GRAPHHOPPER_URL}/route`
    : 'https://graphhopper.com/api/1/route';

  const params = graphHopperParams(origin, destination, stops);

  if (!GRAPHHOPPER_URL && GRAPHHOPPER_API_KEY) {
    params.push(`key=${encodeURIComponent(GRAPHHOPPER_API_KEY)}`);
  }

  const response = await fetchWithTimeout(
    `${base}?${params.join('&')}`,
    { signal, headers: { Accept: 'application/json' } },
    GRAPHHOPPER_TIMEOUT_MS,
  );

  const data = (await response.json()) as GraphHopperResponse;
  if (!response.ok || !data.paths?.[0]) {
    throw new Error(data.message || t('GraphHopper no devolvió una ruta válida.'));
  }

  const routes = data.paths
    .map(routeFromGraphHopperPath)
    .filter((route): route is WorldMapRoute => route !== null);
  if (routes.length === 0) {
    throw new Error(t('GraphHopper devolvió una ruta vacía.'));
  }
  return routes;
}

type OsrmRoute = {
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
};

type OsrmResponse = {
  code?: string;
  routes?: OsrmRoute[];
};

// Servidor público de demostración de OSRM: rutas reales por calle sin API key.
// Para producción conviene GraphHopper propio o un OSRM hospedado.

function routeFromOsrm(route: OsrmRoute): WorldMapRoute | null {
  const coordinates = validLatLng(route.geometry?.coordinates);
  if (coordinates.length < 2) return null;
  return {
    coordinates: compactRouteCoordinates(coordinates),
    distanceM: route.distance,
    timeMs: route.duration * 1000,
    source: 'osrm',
    instructions: instructionsFromOsrm(route.legs?.flatMap((leg) => leg.steps ?? []) ?? []),
  };
}

// URL de OSRM con paradas (alternativas solo sin paradas, como GraphHopper).
export function osrmUrl(origin: GeoPoint, destination: GeoPoint, stops: GeoPoint[] = []) {
  const path = [origin, ...stops, destination]
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');
  const alternatives = stops.length === 0 ? MAX_ROUTES : 'false';
  return `${OSRM_URL}/route/v1/driving/${encodeURIComponent(path)}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}&continue_straight=false`;
}

export async function fetchOsrmRoutes({
  origin,
  destination,
  stops = [],
  signal,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  stops?: GeoPoint[];
  signal?: AbortSignal;
}): Promise<WorldMapRoute[]> {
  const url = osrmUrl(origin, destination, stops);

  const response = await fetchWithTimeout(
    url,
    { signal, headers: { Accept: 'application/json' } },
    OSRM_TIMEOUT_MS,
  );
  const data = (await response.json()) as OsrmResponse;
  if (!response.ok || !data.routes?.[0]) {
    throw new Error(data.code ? t('OSRM respondió {0}.', data.code) : t('OSRM no devolvió una ruta válida.'));
  }

  const routes = data.routes
    .map(routeFromOsrm)
    .filter((route): route is WorldMapRoute => route !== null);
  if (routes.length === 0) {
    throw new Error(t('OSRM devolvió una ruta vacía.'));
  }
  return routes;
}

// Rutas posibles ordenadas de la más rápida a la más lenta (SW-08 / RNF-14):
// GraphHopper, luego OSRM y, si ninguno responde, la línea directa marcada
// como source «fallback» para que la app avise de que no es una ruta por calles.
export async function fetchStreetRoutes({
  origin,
  destination,
  stops = [],
  signal,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  stops?: GeoPoint[];
  signal?: AbortSignal;
}): Promise<WorldMapRoute[]> {
  const byTime = (routes: WorldMapRoute[]) =>
    [...routes].sort((a, b) => a.timeMs - b.timeMs).slice(0, MAX_ROUTES);
  if (isGraphHopperConfigured) {
    try {
      return byTime(await fetchGraphHopperRoutes({ origin, destination, stops, signal }));
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  try {
    return byTime(await fetchOsrmRoutes({ origin, destination, stops, signal }));
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return [fallbackRoute(origin, destination, stops)];
}

export function formatRouteDistance(distanceM: number) {
  return formatDistance(distanceM);
}

export function formatRouteTime(timeMs: number) {
  const minutes = Math.max(1, Math.round(timeMs / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return t('{0} h {1} min', hours, rest);
}
