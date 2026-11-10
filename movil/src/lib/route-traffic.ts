// Tráfico a lo largo de la ruta (como Google Maps: la ruta se pinta de
// naranja o rojo donde hay retención). Llega por índices de punto de la
// polilínea original (Google: speedReadingIntervals; Mapbox: congestion por
// tramo) y se guarda como fracciones de la longitud (0…1), que siguen valiendo
// aunque luego se simplifique la geometría.

export type TrafficLevel = 'moderate' | 'heavy' | 'severe';

export type TrafficSpan = { from: number; to: number; level: TrafficLevel };

// Intervalo por índices de punto: [start, end] de la polilínea.
export type TrafficInterval = { start: number; end: number; level: TrafficLevel };

export const TRAFFIC_COLORS: Record<TrafficLevel, string> = {
  moderate: '#f59e0b',
  heavy: '#ef4444',
  severe: '#991b1b',
};

function segmentMeters(a: [number, number], b: [number, number]) {
  // [lng, lat]
  const latMid = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  return Math.hypot((b[0] - a[0]) * 111_320 * Math.cos(latMid), (b[1] - a[1]) * 110_540);
}

// coordinates en [lng, lat] (GeoJSON), los índices de intervals se refieren a ellas.
export function trafficSpans(coordinates: [number, number][], intervals: TrafficInterval[]): TrafficSpan[] {
  if (coordinates.length < 2 || intervals.length === 0) return [];
  const cumulative = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    cumulative.push(cumulative[i - 1] + segmentMeters(coordinates[i - 1], coordinates[i]));
  }
  const total = cumulative[cumulative.length - 1];
  if (total <= 0) return [];
  const last = coordinates.length - 1;
  const spans: TrafficSpan[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    const start = Math.max(0, Math.min(last, Math.floor(interval.start)));
    const end = Math.max(0, Math.min(last, Math.floor(interval.end)));
    if (end <= start) continue;
    const from = cumulative[start] / total;
    const to = cumulative[end] / total;
    const previous = spans[spans.length - 1];
    // Une tramos seguidos del mismo nivel y descarta solapes.
    if (previous && from < previous.to) continue;
    if (previous && previous.level === interval.level && from - previous.to < 1e-6) {
      previous.to = to;
    } else if (to - from > 1e-6) {
      spans.push({ from, to, level: interval.level });
    }
  }
  return spans;
}

// Mapbox: un nivel por tramo entre puntos («low», «moderate», «heavy»,
// «severe», «unknown») → intervalos.
export function intervalsFromCongestion(levels: string[]): TrafficInterval[] {
  const intervals: TrafficInterval[] = [];
  levels.forEach((raw, index) => {
    const level = raw === 'moderate' || raw === 'heavy' || raw === 'severe' ? raw : null;
    if (!level) return;
    const previous = intervals[intervals.length - 1];
    if (previous && previous.level === level && previous.end === index) previous.end = index + 1;
    else intervals.push({ start: index, end: index + 1, level });
  });
  return intervals;
}

// Degradado por escalones para la línea de la ruta (line-progress de Mapbox).
export function trafficGradient(spans: TrafficSpan[] | undefined, base: string): unknown | null {
  if (!spans || spans.length === 0) return null;
  const expression: unknown[] = ['step', ['line-progress'], base];
  let cursor = 0;
  for (const span of spans) {
    // Los escalones deben ir en orden estrictamente creciente.
    const from = Math.max(span.from, cursor + 1e-5);
    const to = Math.min(1, span.to);
    if (to <= from) continue;
    expression.push(from, TRAFFIC_COLORS[span.level], to, base);
    cursor = to;
  }
  return expression.length > 3 ? expression : null;
}
