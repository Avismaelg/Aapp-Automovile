import { haversineMeters } from '@/src/lib/geo';
import { fetchWithTimeout } from '@/src/lib/network';

export type SearchPlace = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  detail: string;
  distanceM: number | null;
};

type PhotonFeature = {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
};

// Grupos de cercanía: primero lo que tienes a mano (3 km), luego tu ciudad,
// tu zona, tu región y al final el resto del mundo. Dentro de cada grupo se
// respeta la relevancia de Photon.
const PROXIMITY_BUCKETS_M = [3_000, 15_000, 50_000, 300_000];

function proximityBucket(distanceM: number | null) {
  if (distanceM == null) return PROXIMITY_BUCKETS_M.length;
  const index = PROXIMITY_BUCKETS_M.findIndex((limit) => distanceM <= limit);
  return index === -1 ? PROXIMITY_BUCKETS_M.length : index;
}

export function rankByProximity(places: SearchPlace[]) {
  return places
    .map((place, order) => ({ place, order, bucket: proximityBucket(place.distanceM) }))
    .sort((a, b) => a.bucket - b.bucket || a.order - b.order)
    .map((entry) => entry.place);
}

// Búsqueda de lugares con Photon (OpenStreetMap, sin API key).
export async function searchPlaces(
  query: string,
  near: { latitude: number; longitude: number } | null,
  signal: AbortSignal,
): Promise<SearchPlace[]> {
  // Pedimos de más para tener candidatos cercanos que reordenar.
  const params = new URLSearchParams({ q: query.trim(), limit: '20' });
  if (near) {
    params.set('lat', near.latitude.toFixed(5));
    params.set('lon', near.longitude.toFixed(5));
    // Sesgo fuerte hacia tu posición: «farmacia» debe dar las de tu barrio,
    // no las más «relevantes» del país (con zoom 10 salían a 10-130 km).
    params.set('zoom', '14');
    params.set('location_bias_scale', '0.2');
  }

  const response = await fetchWithTimeout(
    `https://photon.komoot.io/api/?${params.toString()}`,
    { signal },
  );
  const data = (await response.json()) as { features?: PhotonFeature[] };
  const features = data.features ?? [];

  const results: SearchPlace[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) continue;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const properties = feature.properties ?? {};
    const name = properties.name?.trim() || '';
    const street = [properties.street, properties.housenumber].filter(Boolean).join(' ').trim();
    const detail = [street, properties.city, properties.state, properties.country]
      .filter((part): part is string => Boolean(part && part.trim()))
      .filter((part, index, all) => all.indexOf(part) === index)
      .join(', ');
    const label = name || detail;
    if (!label) continue;

    const key = `${label}@${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      id: key,
      latitude,
      longitude,
      name: label,
      detail: name ? detail : '',
      distanceM: near ? haversineMeters(near, { latitude, longitude }) : null,
    });
  }
  return rankByProximity(results).slice(0, 10);
}

export function formatSearchDistance(meters: number | null) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `a ${Math.round(meters)} m`;
  return `a ${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}
