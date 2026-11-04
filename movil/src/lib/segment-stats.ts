import type { HighwaySegment } from '@/src/lib/highway-records';
import type { Trip } from '@/src/store/trips';

// Sin dependencias de red ni almacenamiento: se prueba en Jest tal cual.
const CORRIDOR_METERS = 160;
// Por debajo, parado o en un atasco: no dice nada del límite.
const MIN_MOVING_KMH = 10;

function pointToPolylineMeters(
  point: { latitude: number; longitude: number },
  polyline: [number, number][],
) {
  if (polyline.length < 2) return Infinity;
  const latRad = (point.latitude * Math.PI) / 180;
  let best = Infinity;
  for (let index = 1; index < polyline.length; index += 1) {
    const [aLat, aLng] = polyline[index - 1];
    const [bLat, bLng] = polyline[index];
    const ax = (aLng - point.longitude) * 111320 * Math.cos(latRad);
    const ay = (aLat - point.latitude) * 111320;
    const bx = (bLng - point.longitude) * 111320 * Math.cos(latRad);
    const by = (bLat - point.latitude) * 111320;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    const px = ax + dx * t;
    const py = ay + dy * t;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}

// P0-4 (docs/AUDITORIA-PRODUCCION.md): nada de clasificaciones ni récords de
// velocidad. Por tramo solo se cuenta, en privado y en el teléfono, cuántas
// veces lo recorriste y qué parte del recorrido fue dentro del límite.
export type SegmentStats = { passes: number; withinLimitPct: number | null };

export function segmentStats(trips: Trip[], segment: HighwaySegment): SegmentStats {
  let passes = 0;
  let measured = 0;
  let within = 0;
  for (const trip of trips) {
    let inside = false;
    for (const point of trip.points) {
      if (pointToPolylineMeters(point, segment.polyline) > CORRIDOR_METERS) continue;
      inside = true;
      if (point.speedKmh == null || point.speedKmh < MIN_MOVING_KMH) continue;
      measured += 1;
      if (point.speedKmh <= segment.speedLimitKmh) within += 1;
    }
    if (inside) passes += 1;
  }
  return { passes, withinLimitPct: measured > 0 ? Math.round((within / measured) * 100) : null };
}
