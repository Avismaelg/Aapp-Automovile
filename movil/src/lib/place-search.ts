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

// Búsqueda de lugares con Photon (OpenStreetMap, sin API key).
export async function searchPlaces(
  query: string,
  near: { latitude: number; longitude: number } | null,
  signal: AbortSignal,
): Promise<SearchPlace[]> {
  const params = new URLSearchParams({ q: query.trim(), limit: '10' });
  if (near) {
    params.set('lat', near.latitude.toFixed(5));
    params.set('lon', near.longitude.toFixed(5));
  }

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { signal });
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
    if (results.length >= 10) break;
  }
  return results;
}

export function formatSearchDistance(meters: number | null) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `a ${Math.round(meters)} m`;
  return `a ${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}
