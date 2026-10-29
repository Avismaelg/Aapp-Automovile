import type { EventRoute } from '@/src/lib/events';
import { fetchWithTimeout } from '@/src/lib/network';
import { compactRouteCoordinates } from '@/src/lib/route-geometry';

type RoutePoint = { latitude: number; longitude: number };

type OsrmResponse = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { coordinates: [number, number][] };
  }[];
};

// Ruta real por calles pasando por todos los puntos del evento (salida,
// paradas y meta). OSRM acepta varios waypoints separados por ';'.
export async function fetchRouteThrough(
  points: RoutePoint[],
  signal?: AbortSignal,
): Promise<EventRoute> {
  if (points.length < 2) {
    throw new Error('Añade al menos una salida y una meta.');
  }

  const path = points.map((point) => `${point.longitude},${point.latitude}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${encodeURIComponent(path)}?overview=full&geometries=geojson&steps=false&alternatives=false`;

  const response = await fetchWithTimeout(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const data = (await response.json()) as OsrmResponse;
  const route = data.routes?.[0];
  if (!response.ok || !route) {
    throw new Error('No pudimos calcular la ruta del evento. Inténtalo de nuevo.');
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
    throw new Error('La ruta del evento salió vacía.');
  }

  return {
    coordinates: compactRouteCoordinates(coordinates),
    distanceM: route.distance,
    timeMs: route.duration * 1000,
  };
}
