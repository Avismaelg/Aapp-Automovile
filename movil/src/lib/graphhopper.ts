import type { WorldMapRoute } from '@/src/lib/map-html';
import { haversineMeters } from '@/src/lib/geo';
import { fetchWithTimeout } from '@/src/lib/network';
import { instructionsFromGraphHopper, instructionsFromOsrm } from '@/src/lib/route-instructions';
import { compactRouteCoordinates } from '@/src/lib/route-geometry';
import { intervalsFromCongestion, trafficSpans, type TrafficInterval } from '@/src/lib/route-traffic';
import { formatDistance, getLanguage, t } from '@/src/i18n';
import {
  GRAPHHOPPER_TIMEOUT_MS,
  isOsrmConfigured,
  MAPBOX_DIRECTIONS_TIMEOUT_MS,
  MAPBOX_DIRECTIONS_URL,
  MAPBOX_TOKEN,
  OSRM_TIMEOUT_MS,
  OSRM_URL,
} from '@/src/lib/providers';

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
  // Google (función routes): retenciones por índice de punto.
  traffic?: TrafficInterval[];
  legs?: {
    // Mapbox (annotations=congestion): un nivel por tramo entre puntos.
    annotation?: { congestion?: string[] };
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

function routeFromOsrm(route: OsrmRoute, source: 'osrm' | 'mapbox' | 'google' = 'osrm'): WorldMapRoute | null {
  const coordinates = validLatLng(route.geometry?.coordinates);
  if (coordinates.length < 2) return null;
  return {
    coordinates: compactRouteCoordinates(coordinates),
    distanceM: route.distance,
    timeMs: route.duration * 1000,
    source,
    instructions: instructionsFromOsrm(route.legs?.flatMap((leg) => leg.steps ?? []) ?? []),
    traffic: routeTraffic(route),
  };
}

function routeTraffic(route: OsrmRoute) {
  const raw = route.geometry?.coordinates ?? [];
  const intervals =
    route.traffic ??
    intervalsFromCongestion(route.legs?.flatMap((leg) => leg.annotation?.congestion ?? []) ?? []);
  const spans = trafficSpans(raw, intervals);
  return spans.length > 0 ? spans : undefined;
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
    .map((route) => routeFromOsrm(route))
    .filter((route): route is WorldMapRoute => route !== null);
  if (routes.length === 0) {
    throw new Error(t('OSRM devolvió una ruta vacía.'));
  }
  return routes;
}

export const isMapboxDirectionsConfigured = MAPBOX_TOKEN.startsWith('pk.');

// MAPA-12: rutas con el tráfico de Google por la Edge Function «routes» (la
// clave no está en la app). Sin función, sin clave o pasado el tope del día,
// se deja de usar 10 min y valen Mapbox y los demás.
const GOOGLE_ROUTES_PAUSE_MS = 10 * 60_000;
const GOOGLE_ROUTES_TIMEOUT_MS = 4_000;
let googleRoutesPausedUntil = 0;

export async function fetchGoogleRoutes({
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
  if (Date.now() < googleRoutesPausedUntil) throw new Error('google_paused');
  // Import diferido: el resto del motor se prueba sin el cliente de Supabase.
  const { supabase } = await import('@/src/lib/supabase');
  if (!supabase) throw new Error('supabase_not_configured');
  const point = (p: GeoPoint) => ({ lat: p.latitude, lng: p.longitude });
  const call = supabase.functions.invoke('routes', {
    body: { origin: point(origin), destination: point(destination), stops: stops.map(point), language: getLanguage() },
  });
  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), GOOGLE_ROUTES_TIMEOUT_MS);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    });
  });
  const { data, error } = await Promise.race([call, timeout]);
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 404 || status === 429 || status === 503) {
      googleRoutesPausedUntil = Date.now() + GOOGLE_ROUTES_PAUSE_MS;
    }
    throw new Error(error.message);
  }
  const routes = ((data as OsrmResponse | null)?.routes ?? [])
    .map((route) => routeFromOsrm(route, 'google'))
    .filter((route): route is WorldMapRoute => route !== null);
  if (routes.length === 0) throw new Error(t('Google no devolvió una ruta válida.'));
  return routes;
}

// Mapbox con tráfico en vivo. Responde en el mismo formato que OSRM (pasos con
// maniobra y nombre de calle), así que se reutiliza su conversión.
export function mapboxDirectionsUrl(origin: GeoPoint, destination: GeoPoint, stops: GeoPoint[] = []) {
  const path = [origin, ...stops, destination]
    .map((point) => `${point.longitude.toFixed(6)},${point.latitude.toFixed(6)}`)
    .join(';');
  const params = [
    'overview=full',
    'geometries=geojson',
    'steps=true',
    'annotations=congestion',
    `alternatives=${stops.length === 0 ? 'true' : 'false'}`,
    'continue_straight=false',
    `language=${getLanguage()}`,
    `access_token=${encodeURIComponent(MAPBOX_TOKEN)}`,
  ];
  return `${MAPBOX_DIRECTIONS_URL}/mapbox/driving-traffic/${path}?${params.join('&')}`;
}

export async function fetchMapboxRoutes({
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
  if (!isMapboxDirectionsConfigured) throw new Error(t('Mapbox no está configurado.'));
  const response = await fetchWithTimeout(
    mapboxDirectionsUrl(origin, destination, stops),
    { signal, headers: { Accept: 'application/json' } },
    MAPBOX_DIRECTIONS_TIMEOUT_MS,
  );
  const data = (await response.json()) as OsrmResponse & { message?: string };
  if (!response.ok || data.code !== 'Ok' || !data.routes?.[0]) {
    throw new Error(data.message || t('Mapbox no devolvió una ruta válida.'));
  }
  const routes = data.routes
    .map((route) => routeFromOsrm(route, 'mapbox'))
    .filter((route): route is WorldMapRoute => route !== null);
  if (routes.length === 0) throw new Error(t('Mapbox no devolvió una ruta válida.'));
  return routes;
}

// Rutas posibles ordenadas de la más rápida a la más lenta (SW-08 / RNF-14):
// Google con tráfico, Mapbox con tráfico, luego GraphHopper, luego OSRM y, si ninguno responde, la línea directa marcada
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
  try {
    return byTime(await fetchGoogleRoutes({ origin, destination, stops, signal }));
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  if (isMapboxDirectionsConfigured) {
    try {
      return byTime(await fetchMapboxRoutes({ origin, destination, stops, signal }));
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  if (isGraphHopperConfigured) {
    try {
      return byTime(await fetchGraphHopperRoutes({ origin, destination, stops, signal }));
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  if (isOsrmConfigured) {
    try {
      return byTime(await fetchOsrmRoutes({ origin, destination, stops, signal }));
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  // Cancelado (nuevo destino, saliste): nunca se devuelve una ruta inventada.
  if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
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
