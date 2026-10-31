import { DOMINICAN_PLACES, type KnownPlace } from '@/src/data/do-places';
import { haversineMeters } from '@/src/lib/geo';
import { fetchWithTimeout } from '@/src/lib/network';

export type SearchPlace = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  detail: string;
  distanceM: number | null;
  // Para ordenar: importancia del tipo de lugar (0–1) y parecido con lo
  // escrito (0–1).
  importance?: number;
  match?: number;
};

type LatLng = { latitude: number; longitude: number };

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
    countrycode?: string;
    osm_key?: string;
    osm_value?: string;
  };
};

// República Dominicana (para la segunda búsqueda, sin sesgo de cercanía).
const DO_BBOX = '-72.01,17.36,-68.32,19.98';

// ---------------------------------------------------------------------------
// Texto: sin tildes, sin mayúsculas y con faltas
// ---------------------------------------------------------------------------

export function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Abreviaturas que se escriben al buscar direcciones.
const ABBREVIATIONS: Record<string, string> = {
  av: 'avenida',
  ave: 'avenida',
  avda: 'avenida',
  c: 'calle',
  cl: 'calle',
  carr: 'carretera',
  ctra: 'carretera',
  aut: 'autopista',
  prol: 'prolongacion',
  res: 'residencial',
  urb: 'urbanizacion',
  ens: 'ensanche',
  pza: 'plaza',
  sto: 'santo',
  sta: 'santa',
  dgo: 'domingo',
  sd: 'santo domingo',
  rd: 'republica dominicana',
  pto: 'puerto',
  aerop: 'aeropuerto',
};

function expandAbbreviations(normalized: string) {
  return normalized
    .split(' ')
    .map((word) => ABBREVIATIONS[word] ?? word)
    .join(' ');
}

// Distancia de edición con transposiciones («cnaa» → «cana» es 1).
function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// Errores tolerados según lo larga que es la palabra (en las de 3 letras, uno
// si empiezan igual: «cna» → «cana», pero «mao» no es «san»).
const allowedTypos = (typed: string, word: string) =>
  typed.length <= 2 ? 0 : typed.length === 3 ? (typed[0] === word[0] ? 1 : 0) : typed.length <= 5 ? 1 : 2;

// Parecido de una palabra escrita con una del nombre: 1 exacta, 0,9 empieza
// igual (escribiendo aún), menos con faltas.
function wordScore(typed: string, word: string, isLast: boolean) {
  if (typed === word) return 1;
  if (isLast && typed.length >= 2 && word.startsWith(typed)) return 0.9;
  const max = allowedTypos(typed, word);
  if (max === 0) return 0;
  const distance = editDistance(typed, word, max);
  if (distance <= max) return 0.85 - distance * 0.1;
  // Escribiendo la última palabra con una falta: «cna» → «cana».
  if (isLast && typed.length >= 3) {
    const prefix = word.slice(0, typed.length + 1);
    if (editDistance(typed, prefix, 1) <= 1) return 0.7;
  }
  return 0;
}

// Parecido de lo escrito con un nombre (0–1): cada palabra escrita debe
// encontrarse (con faltas) en el nombre; sobran palabras del nombre → baja un
// poco («punta cana» casa mejor con «Punta Cana» que con «Calle Punta Cana»).
export function textMatch(query: string, candidate: string) {
  const typed = expandAbbreviations(normalizeText(query)).split(' ').filter(Boolean);
  const words = normalizeText(candidate).split(' ').filter(Boolean);
  if (!typed.length || !words.length) return 0;
  // Todo junto también vale: «puntacana», «capcana».
  if (typed.join('') === words.join('')) return 1;
  let total = 0;
  const used = new Set<number>();
  for (let i = 0; i < typed.length; i += 1) {
    let best = 0;
    let bestIndex = -1;
    words.forEach((word, index) => {
      if (used.has(index)) return;
      const score = wordScore(typed[i], word, i === typed.length - 1);
      if (score > best) {
        best = score;
        bestIndex = index;
      }
    });
    if (best === 0) return 0;
    used.add(bestIndex);
    total += best;
  }
  const coverage = typed.length / Math.max(words.length, typed.length);
  return (total / typed.length) * (0.75 + 0.25 * coverage);
}

// ---------------------------------------------------------------------------
// Orden de resultados
// ---------------------------------------------------------------------------

const KNOWN_IMPORTANCE: Record<KnownPlace['kind'], number> = {
  city: 1,
  town: 1,
  airport: 0.95,
  beach: 0.85,
  island: 0.8,
  mall: 0.8,
  district: 0.8,
  park: 0.75,
  landmark: 0.75,
  monument: 0.7,
  stadium: 0.7,
  lake: 0.7,
  peak: 0.7,
  waterfall: 0.7,
  street: 0.6,
};

function photonImportance(key?: string, value?: string) {
  if (key === 'place') {
    if (value === 'city' || value === 'town') return 0.95;
    if (value === 'village' || value === 'suburb') return 0.75;
    return 0.6;
  }
  if (value === 'aerodrome') return 0.9;
  if (value === 'mall' || value === 'beach' || value === 'hospital' || value === 'university') return 0.7;
  if (key === 'highway') return value === 'bus_stop' ? 0.1 : 0.35;
  if (key === 'amenity' || key === 'shop' || key === 'tourism' || key === 'leisure') return 0.55;
  return 0.4;
}

// Lo cercano pesa, pero no tanto como para que una calle «Punta Cana» de tu
// barrio gane a la ciudad de Punta Cana.
function proximityBonus(distanceM: number | null) {
  if (distanceM == null) return 0;
  if (distanceM <= 3_000) return 1.5;
  if (distanceM <= 15_000) return 1.2;
  if (distanceM <= 50_000) return 0.8;
  if (distanceM <= 300_000) return 0.5;
  return 0;
}

// El nombre exacto pesa más que estar cerca: «punta cana» → la ciudad, no
// «Punta Cana Resort and Club» a 1 km.
export function placeScore(place: SearchPlace) {
  const match = place.match ?? 0.5;
  return (
    3 * match +
    (match >= 0.99 ? 1 : 0) +
    (place.importance ?? 0.4) +
    proximityBonus(place.distanceM)
  );
}

// Fusiona y ordena. Un mismo sitio repetido (el listado y Photon, o dos nodos
// del mapa a pocos metros) aparece una sola vez.
export function rankPlaces(places: SearchPlace[], limit = 10) {
  const sorted = places
    .map((place, order) => ({ place, order, score: placeScore(place) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.place);
  const kept: SearchPlace[] = [];
  for (const place of sorted) {
    const name = normalizeText(place.name);
    const duplicate = kept.some((other) => {
      const otherName = normalizeText(other.name);
      // El mismo nombre exacto es el mismo sitio aunque OpenStreetMap lo ponga
      // en otro punto del pueblo (el centro, el límite del municipio…).
      if (name === otherName) return haversineMeters(place, other) < 8_000;
      const similar = name.includes(otherName) || otherName.includes(name);
      return similar && haversineMeters(place, other) < 2_000;
    });
    if (!duplicate) kept.push(place);
    if (kept.length >= limit) break;
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

// Destinos conocidos de RD: instantáneo, sin conexión y con faltas.
export function searchKnownPlaces(query: string, near: LatLng | null): SearchPlace[] {
  if (normalizeText(query).length < 2) return [];
  const found: SearchPlace[] = [];
  for (const place of DOMINICAN_PLACES) {
    const match = Math.max(
      textMatch(query, place.name),
      ...place.aliases.map((alias) => textMatch(query, alias) * 0.97),
    );
    if (match < 0.6) continue;
    found.push({
      id: `known:${place.name}`,
      latitude: place.latitude,
      longitude: place.longitude,
      name: place.name,
      detail: place.detail,
      distanceM: near ? haversineMeters(near, place) : null,
      importance: KNOWN_IMPORTANCE[place.kind],
      match,
    });
  }
  return found;
}

function parsePhoton(
  features: PhotonFeature[],
  query: string,
  near: LatLng | null,
): SearchPlace[] {
  const results: SearchPlace[] = [];
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

    // Photon ya filtró por texto: aunque no case palabra a palabra (p. ej.
    // «farmacia» → «Farmacia Carol»), le damos un parecido mínimo. Lo que no
    // se parece en nada y está en otro país es ruido («punta cna» → «CNP»).
    const text = textMatch(query, label);
    const distanceM = near ? haversineMeters(near, { latitude, longitude }) : null;
    if (text === 0 && properties.countrycode !== 'DO' && (distanceM == null || distanceM > 300_000)) {
      continue;
    }
    const match = Math.max(0.45, text);
    results.push({
      id: `${label}@${latitude.toFixed(5)},${longitude.toFixed(5)}`,
      latitude,
      longitude,
      name: label,
      detail: name ? detail : '',
      distanceM,
      importance:
        photonImportance(properties.osm_key, properties.osm_value) +
        (properties.countrycode === 'DO' ? 0.3 : 0),
      match,
    });
  }
  return results;
}

type MapboxFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; feature_type?: string; place_formatted?: string };
};

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

const MAPBOX_IMPORTANCE: Record<string, number> = {
  place: 1,
  locality: 0.8,
  neighborhood: 0.7,
  district: 0.7,
  address: 0.65,
  street: 0.5,
};

// Calles, barrios y pueblos de RD con Mapbox: tolera faltas y sigue
// funcionando si Photon está caído o nos limita.
async function mapbox(query: string, near: LatLng | null, signal: AbortSignal): Promise<SearchPlace[]> {
  if (!MAPBOX_TOKEN) return [];
  const params = new URLSearchParams({
    q: query,
    country: 'do',
    language: 'es',
    limit: '6',
    access_token: MAPBOX_TOKEN,
  });
  if (near) params.set('proximity', `${near.longitude.toFixed(5)},${near.latitude.toFixed(5)}`);
  const response = await fetchWithTimeout(
    `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`,
    { signal },
  );
  const data = (await response.json()) as { features?: MapboxFeature[] };
  return (data.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    const name = feature.properties?.name?.trim();
    if (!name || !coordinates) return [];
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const text = textMatch(query, name);
    if (text === 0) return [];
    return [
      {
        id: `mapbox:${name}@${latitude.toFixed(5)},${longitude.toFixed(5)}`,
        latitude,
        longitude,
        name,
        detail: feature.properties?.place_formatted ?? '',
        distanceM: near ? haversineMeters(near, { latitude, longitude }) : null,
        importance: (MAPBOX_IMPORTANCE[feature.properties?.feature_type ?? ''] ?? 0.4) + 0.3,
        match: text,
      },
    ];
  });
}

async function photon(params: URLSearchParams, signal: AbortSignal) {
  const response = await fetchWithTimeout(`https://photon.komoot.io/api/?${params.toString()}`, {
    signal,
  });
  const data = (await response.json()) as { features?: PhotonFeature[] };
  return data.features ?? [];
}

// Búsqueda de lugares, todo a la vez: el listado de RD (instantáneo), Photon
// (OpenStreetMap: comercios y sitios, cerca de ti y en todo el país) y Mapbox
// (calles y pueblos). Si una fuente falla, valen las demás.
// Lo ya buscado se reutiliza 10 min (borrar y volver a escribir no repite las
// tres consultas; también evita que Photon nos limite).
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_SIZE = 40;
const cache = new Map<string, { at: number; places: SearchPlace[] }>();

export async function searchPlaces(
  query: string,
  near: LatLng | null,
  signal: AbortSignal,
): Promise<SearchPlace[]> {
  const q = query.trim();
  // Cerca de lo mismo (~1 km) cuenta como la misma búsqueda.
  const cacheKey = `${normalizeText(q)}@${near ? `${near.latitude.toFixed(2)},${near.longitude.toFixed(2)}` : '-'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.places;
  const known = searchKnownPlaces(q, near);

  const nearby = new URLSearchParams({ q, limit: '15' });
  if (near) {
    nearby.set('lat', near.latitude.toFixed(5));
    nearby.set('lon', near.longitude.toFixed(5));
    // Sesgo fuerte hacia tu posición: «farmacia» debe dar las de tu barrio.
    nearby.set('zoom', '14');
    nearby.set('location_bias_scale', '0.2');
  }
  const country = new URLSearchParams({ q, limit: '10', bbox: DO_BBOX });

  const settled = await Promise.allSettled([
    photon(nearby, signal).then((features) => parsePhoton(features, q, near)),
    photon(country, signal).then((features) => parsePhoton(features, q, near)),
    mapbox(q, near, signal),
  ]);
  const remote = settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  // Sin conexión, el listado de RD sigue funcionando.
  if (remote.length === 0 && known.length === 0 && settled.every((r) => r.status === 'rejected')) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }
  const places = rankPlaces([...known, ...remote]);
  // Solo se guarda si internet respondió (si no, se reintenta la próxima vez).
  if (remote.length > 0) {
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, { at: Date.now(), places });
  }
  return places;
}

export function formatSearchDistance(meters: number | null) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `a ${Math.round(meters)} m`;
  return `a ${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}
