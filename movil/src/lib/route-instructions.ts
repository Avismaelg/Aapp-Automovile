import type { RouteInstruction, RouteInstructionIcon } from '@/src/lib/map-html';

type LatLng = [number, number];

export type RouteProgress = {
  progressM: number;
  nearestIndex: number;
  distanceM: number;
};

function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  return haversineMeters([a.latitude, a.longitude], [b.latitude, b.longitude]);
}

// Distancia acumulada desde el inicio de la ruta hasta cada punto.
export function cumulativeDistances(points: LatLng[]) {
  const cumulative: number[] = new Array(points.length).fill(0);
  for (let index = 1; index < points.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + haversineMeters(points[index - 1], points[index]);
  }
  return cumulative;
}

// Avance del vehículo sobre la ruta midiendo el punto más cercano.
export function routeProgress(
  points: LatLng[],
  cumulative: number[],
  position: { latitude: number; longitude: number } | null,
): RouteProgress | null {
  if (!position || points.length < 2) return null;
  let nearestIndex = 0;
  let best = Infinity;
  const target: LatLng = [position.latitude, position.longitude];
  for (let index = 0; index < points.length; index += 1) {
    const distance = haversineMeters(points[index], target);
    if (distance < best) {
      best = distance;
      nearestIndex = index;
    }
  }
  return { progressM: cumulative[nearestIndex] ?? 0, nearestIndex, distanceM: best };
}

function iconFromModifier(type: string, modifier: string | undefined): RouteInstructionIcon {
  if (type === 'arrive') return 'arrive';
  if (type === 'depart') return 'depart';
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  if (type === 'merge') return 'merge';
  const value = modifier ?? 'straight';
  if (value.includes('uturn')) return 'uturn';
  if (value.includes('sharp left')) return 'sharp-left';
  if (value.includes('sharp right')) return 'sharp-right';
  if (value.includes('slight left')) return 'slight-left';
  if (value.includes('slight right')) return 'slight-right';
  if (value.includes('left')) return 'left';
  if (value.includes('right')) return 'right';
  return 'straight';
}

function textFromIcon(
  icon: RouteInstructionIcon,
  road: string | undefined,
  exit?: number,
) {
  const suffix = road ? ` por ${road}` : '';
  switch (icon) {
    case 'arrive':
      return 'Has llegado a tu destino';
    case 'depart':
      return road ? `Sal por ${road}` : 'Comienza tu ruta';
    case 'left':
      return `Gira a la izquierda${suffix}`;
    case 'right':
      return `Gira a la derecha${suffix}`;
    case 'slight-left':
      return `Mantente a la izquierda${suffix}`;
    case 'slight-right':
      return `Mantente a la derecha${suffix}`;
    case 'sharp-left':
      return `Giro cerrado a la izquierda${suffix}`;
    case 'sharp-right':
      return `Giro cerrado a la derecha${suffix}`;
    case 'uturn':
      return 'Da la vuelta';
    case 'roundabout':
      return exit ? `En la rotonda, toma la salida ${exit}` : 'Continúa por la rotonda';
    case 'merge':
      return `Incorpórate a la vía${suffix}`;
    default:
      return road ? `Continúa recto por ${road}` : 'Continúa recto';
  }
}

type OsrmStep = {
  distance: number;
  name?: string;
  maneuver?: {
    type?: string;
    modifier?: string;
    exit?: number;
  };
};

// OSRM entrega un paso por maniobra; su maniobra se ejecuta al inicio del paso.
export function instructionsFromOsrm(steps: OsrmStep[]): RouteInstruction[] {
  const instructions: RouteInstruction[] = [];
  let atDistanceM = 0;
  for (const step of steps) {
    const maneuver = step.maneuver ?? {};
    const icon = iconFromModifier(maneuver.type ?? 'turn', maneuver.modifier);
    const road = step.name && step.name.trim() ? step.name.trim() : undefined;
    instructions.push({
      icon,
      text: textFromIcon(icon, road, maneuver.exit),
      road,
      atDistanceM,
    });
    atDistanceM += Number.isFinite(step.distance) ? step.distance : 0;
  }
  return instructions;
}

type GraphHopperInstruction = {
  text?: string;
  distance?: number;
  sign?: number;
  interval?: [number, number];
  street_name?: string;
};

// GraphHopper usa códigos numéricos de señal; el texto ya viene localizado.
export function instructionsFromGraphHopper(
  list: GraphHopperInstruction[],
  points: LatLng[],
): RouteInstruction[] {
  const cumulative = cumulativeDistances(points);
  return list.map((item) => {
    const sign = item.sign ?? 0;
    let icon: RouteInstructionIcon = 'straight';
    if (sign === 4 || sign === 5) icon = 'arrive';
    else if (sign === 6) icon = 'roundabout';
    else if (sign === 1) icon = 'slight-right';
    else if (sign === 2) icon = 'right';
    else if (sign === 3) icon = 'sharp-right';
    else if (sign === -1) icon = 'slight-left';
    else if (sign === -2) icon = 'left';
    else if (sign === -3) icon = 'sharp-left';
    else if (sign === -7) icon = 'slight-left';
    else if (sign === 7) icon = 'slight-right';

    const startIndex = item.interval?.[0] ?? 0;
    const road = item.street_name?.trim() || undefined;
    return {
      icon,
      text: item.text?.trim() || textFromIcon(icon, road),
      road,
      atDistanceM: cumulative[Math.max(0, Math.min(startIndex, cumulative.length - 1))] ?? 0,
    };
  });
}

export function formatInstructionDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return 'ahora';
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.max(10, Math.round(meters / 10) * 10) : Math.round(meters / 50) * 50;
    return `${rounded} m`;
  }
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

// Próxima maniobra a ejecutar y cuánto falta para ella.
export function nextInstruction(
  instructions: RouteInstruction[] | undefined,
  progressM: number | null,
) {
  if (!instructions || instructions.length === 0 || progressM == null) return null;
  const upcoming =
    instructions.find((item) => item.atDistanceM > progressM + 10) ??
    instructions[instructions.length - 1];
  return {
    ...upcoming,
    remainingM: Math.max(0, upcoming.atDistanceM - progressM),
  };
}
