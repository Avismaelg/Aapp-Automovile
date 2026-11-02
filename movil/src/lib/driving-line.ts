// Línea de conducción: tramos de la ruta por delante coloreados según la
// velocidad a la que se pueden tomar. La velocidad recomendada sale del radio
// de cada curva (aceleración lateral cómoda) y se adelanta la frenada para
// llegar a la curva ya a esa velocidad.

type LatLng = [number, number];

export type DrivingLevel = 'go' | 'ease' | 'brake';

export type DrivingLine = {
  data: GeoJSON.FeatureCollection;
  // Próxima curva que pide bajar de la velocidad actual.
  nextCurve: { distanceM: number; speedKmh: number } | null;
};

const LOOKAHEAD_M = 800;
const STEP_M = 10;
// Aceleración lateral cómoda en curva y deceleración de frenada suave (m/s²).
const LATERAL_MS2 = 2.6;
const BRAKE_MS2 = 2.2;
const DEFAULT_MAX_KMH = 120;
const MIN_KMH = 15;
// Margen sobre la recomendada antes de pedir levantar el pie o frenar.
const EASE_OVER_KMH = 4;
const BRAKE_OVER_KMH = 15;
// La zona de curva se extiende 40 m a cada lado para fundirse con la ruta.
const CURVE_FADE_SAMPLES = 4;
// Tramos a menos de 80 m se unen en una sola curva.
const CURVE_MERGE_SAMPLES = 8;

const EARTH_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

function metersBetween(a: LatLng, b: LatLng) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a: LatLng, b: LatLng) {
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x =
    Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) -
    Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return Math.atan2(y, x);
}

// Puntos cada STEP_M metros desde el índice dado, hasta LOOKAHEAD_M.
export function resampleAhead(points: LatLng[], fromIndex: number, lengthM = LOOKAHEAD_M) {
  const out: LatLng[] = [];
  if (fromIndex < 0 || fromIndex >= points.length - 1) return out;
  out.push(points[fromIndex]);
  const maxSamples = Math.floor(lengthM / STEP_M);
  // Metros que faltan para el siguiente punto de muestra.
  let need = STEP_M;
  for (let index = fromIndex; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const segment = metersBetween(a, b);
    let position = 0;
    while (segment - position >= need - 0.01) {
      position += need;
      need = STEP_M;
      const t = position / segment;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      if (out.length > maxSamples) return out;
    }
    need -= segment - position;
  }
  return out;
}

// Velocidad recomendada (km/h) en cada punto remuestreado.
export function recommendedSpeeds(samples: LatLng[], maxKmh: number) {
  const vmax = maxKmh / 3.6;
  const speeds = samples.map(() => vmax);
  const span = 2;
  for (let index = span; index < samples.length - span; index += 1) {
    const before = bearing(samples[index - span], samples[index]);
    const after = bearing(samples[index], samples[index + span]);
    let turn = Math.abs(after - before);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn < 0.02) continue;
    const radius = (span * STEP_M) / turn;
    speeds[index] = Math.min(vmax, Math.sqrt(LATERAL_MS2 * radius));
  }
  // Frenada anticipada: desde el final hacia atrás, cada punto no puede ir
  // más rápido de lo que permite frenar hasta el siguiente.
  for (let index = speeds.length - 2; index >= 0; index -= 1) {
    const reachable = Math.sqrt(speeds[index + 1] ** 2 + 2 * BRAKE_MS2 * STEP_M);
    speeds[index] = Math.min(speeds[index], reachable);
  }
  return speeds.map((value) => Math.max(MIN_KMH, value * 3.6));
}

export function levelFor(currentKmh: number, recommendedKmh: number): DrivingLevel {
  const over = currentKmh - recommendedKmh;
  if (over > BRAKE_OVER_KMH) return 'brake';
  if (over > EASE_OVER_KMH) return 'ease';
  return 'go';
}

export type CurveZone = { start: number; end: number; peak: number; level: DrivingLevel };

// Tramos donde vas más rápido de lo que pide la curva, con su punto más lento.
// El punto se busca solo dentro del tramo: si se mirara más allá, una curva
// «robaría» el punto de la siguiente y saldrían dos discos casi juntos.
export function curveZones(speeds: number[], currentKmh: number): CurveZone[] {
  const zones: CurveZone[] = [];
  let index = 0;
  while (index < speeds.length) {
    if (levelFor(currentKmh, speeds[index]) === 'go') {
      index += 1;
      continue;
    }
    let runEnd = index;
    let level: DrivingLevel = 'ease';
    let peak = index;
    while (runEnd < speeds.length && levelFor(currentKmh, speeds[runEnd]) !== 'go') {
      if (levelFor(currentKmh, speeds[runEnd]) === 'brake') level = 'brake';
      if (speeds[runEnd] < speeds[peak]) peak = runEnd;
      runEnd += 1;
    }
    runEnd -= 1;
    // Dos tramos muy juntos (curvas encadenadas) son una sola zona con un
    // solo disco: el de la velocidad más baja.
    const previous = zones[zones.length - 1];
    if (previous && index - previous.end <= CURVE_MERGE_SAMPLES) {
      previous.end = runEnd;
      if (speeds[peak] < speeds[previous.peak]) previous.peak = peak;
      if (level === 'brake') previous.level = 'brake';
    } else {
      zones.push({ start: index, end: runEnd, peak, level });
    }
    index = runEnd + 1;
  }
  return zones;
}

// Próxima curva que pide bajar de la velocidad actual: a qué distancia está
// su punto más lento y a qué velocidad hay que tomarla.
export function nextCurveAhead(
  speeds: number[],
  currentKmh: number,
  maxKmh: number,
): DrivingLine['nextCurve'] {
  const reference = Math.min(maxKmh, Math.max(currentKmh, 30));
  for (let index = 1; index < speeds.length; index += 1) {
    if (speeds[index] < reference - 10) {
      // El punto más lento de toda esa curva (mientras siga por debajo), el
      // mismo que lleva el disco del mapa: antes se miraban solo 100 m y, si
      // la frenada empezaba antes, el aviso decía 60 y el disco 25.
      let slowestIndex = index;
      for (let k = index; k < speeds.length && speeds[k] < reference - 10; k += 1) {
        if (speeds[k] < speeds[slowestIndex]) slowestIndex = k;
      }
      return {
        distanceM: slowestIndex * STEP_M,
        speedKmh: Math.round(speeds[slowestIndex] / 5) * 5,
      };
    }
  }
  return null;
}

export function buildDrivingLine(
  points: LatLng[],
  fromIndex: number,
  currentKmh: number,
  limitKmh: number | null,
): DrivingLine {
  const samples = resampleAhead(points, fromIndex);
  if (samples.length < 3) return { data: { type: 'FeatureCollection', features: [] }, nextCurve: null };
  const maxKmh = limitKmh && limitKmh > 0 ? limitKmh : DEFAULT_MAX_KMH;
  const speeds = recommendedSpeeds(samples, maxKmh);

  // Zonas de curva: donde vas más rápido de lo que pide la curva. Cada zona se
  // dibuja del ancho de la ruta con un degradado azul → ámbar → rojo → ámbar →
  // azul, centrado en el punto más lento (Mapbox no deja que el degradado
  // cambie por curva, así que la zona se hace simétrica alrededor de él), y
  // lleva un disco con la velocidad recomendada en ese punto.
  const toLngLat = ([lat, lng]: LatLng) => [lng, lat];
  const zones = curveZones(speeds, currentKmh);

  const features: GeoJSON.Feature[] = [];
  for (const zone of zones) {
    const half = Math.max(zone.peak - zone.start, zone.end - zone.peak) + CURVE_FADE_SAMPLES;
    const from = Math.max(0, zone.peak - half);
    const to = Math.min(samples.length - 1, zone.peak + half);
    if (to <= from) continue;
    features.push({
      type: 'Feature',
      properties: { kind: 'curve', level: zone.level },
      geometry: { type: 'LineString', coordinates: samples.slice(from, to + 1).map(toLngLat) },
    });
    features.push({
      type: 'Feature',
      properties: { kind: 'badge', level: zone.level, speed: String(Math.round(speeds[zone.peak] / 5) * 5) },
      geometry: { type: 'Point', coordinates: toLngLat(samples[zone.peak]) },
    });
  }

  const nextCurve = nextCurveAhead(speeds, currentKmh, maxKmh);

  return { data: { type: 'FeatureCollection', features }, nextCurve };
}
