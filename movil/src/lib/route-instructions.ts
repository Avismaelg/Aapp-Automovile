import type { RouteInstruction, RouteInstructionIcon } from '@/src/lib/map-html';
import { formatManeuverDistance, t } from '@/src/i18n';
import { haversineMeters, haversineTupleMeters } from '@/src/lib/geo';

type LatLng = [number, number];

export type RouteProgress = {
  progressM: number;
  nearestIndex: number;
  distanceM: number;
  // Tu posición proyectada sobre la ruta (para pegar el coche a la calle).
  snapped: { latitude: number; longitude: number };
};

// MAPA-06: navegando y cerca de la ruta, el coche se dibuja sobre la calle de
// la ruta y no donde lo pone un GPS impreciso (en la tableta «se volaba
// calles»: saltaba entre cuadras). Más lejos de SNAP_MAX_M es que de verdad
// te saliste: se dibuja tu posición real y entra el «fuera de ruta».
export const SNAP_MAX_M = 30;

export function snappedPosition(
  position: { latitude: number; longitude: number; accuracy?: number | null },
  progress: RouteProgress | null,
) {
  if (!progress || progress.distanceM > SNAP_MAX_M) return null;
  // Con un GPS muy malo tampoco se sabe si sigues en esa calle.
  if (position.accuracy != null && position.accuracy > 60) return null;
  return progress.snapped;
}

export { haversineMeters as metersBetween };

// Distancia acumulada desde el inicio de la ruta hasta cada punto.
export function cumulativeDistances(points: LatLng[]) {
  const cumulative: number[] = new Array(points.length).fill(0);
  for (let index = 1; index < points.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + haversineTupleMeters(points[index - 1], points[index]);
  }
  return cumulative;
}

// Avance del vehículo sobre la ruta: se proyecta tu posición sobre el tramo
// más cercano (no sobre el punto más cercano). En carreteras rectas con pocos
// puntos el avance antes iba a saltos de cientos de metros y la distancia a
// la ruta salía inflada (falsos «fuera de ruta»).
export function routeProgress(
  points: LatLng[],
  cumulative: number[],
  position: { latitude: number; longitude: number } | null,
): RouteProgress | null {
  if (!position || points.length < 2) return null;
  // Plano local (metros) alrededor de tu posición: suficiente para tramos de
  // calle y mucho más barato que la trigonometría completa.
  const kx = 111_320 * Math.cos((position.latitude * Math.PI) / 180);
  const ky = 110_540;
  let best = Infinity;
  let nearestIndex = 0;
  let along = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const ax = (points[index][1] - position.longitude) * kx;
    const ay = (points[index][0] - position.latitude) * ky;
    const bx = (points[index + 1][1] - position.longitude) * kx;
    const by = (points[index + 1][0] - position.latitude) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    const px = ax + t * dx;
    const py = ay + t * dy;
    const distance2 = px * px + py * py;
    if (distance2 < best) {
      best = distance2;
      nearestIndex = index;
      along = t;
    }
  }
  const segment = (cumulative[nearestIndex + 1] ?? 0) - (cumulative[nearestIndex] ?? 0);
  const from = points[nearestIndex];
  const to = points[nearestIndex + 1] ?? from;
  return {
    progressM: (cumulative[nearestIndex] ?? 0) + along * segment,
    nearestIndex,
    distanceM: Math.sqrt(best),
    snapped: {
      latitude: from[0] + (to[0] - from[0]) * along,
      longitude: from[1] + (to[1] - from[1]) * along,
    },
  };
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
  const suffix = road ? t(' por {0}', road) : '';
  switch (icon) {
    case 'arrive':
      return t('Has llegado a tu destino');
    case 'depart':
      return road ? t('Sal por {0}', road) : t('Comienza tu ruta');
    case 'left':
      return t('Gira a la izquierda{0}', suffix);
    case 'right':
      return t('Gira a la derecha{0}', suffix);
    case 'slight-left':
      return t('Mantente a la izquierda{0}', suffix);
    case 'slight-right':
      return t('Mantente a la derecha{0}', suffix);
    case 'sharp-left':
      return t('Giro cerrado a la izquierda{0}', suffix);
    case 'sharp-right':
      return t('Giro cerrado a la derecha{0}', suffix);
    case 'uturn':
      return t('Da la vuelta');
    case 'roundabout':
      return exit ? t('En la rotonda, toma la salida {0}', exit) : t('Continúa por la rotonda');
    case 'merge':
      return t('Incorpórate a la vía{0}', suffix);
    default:
      return road ? t('Continúa recto por {0}', road) : t('Continúa recto');
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
  // Con paradas OSRM manda un tramo por parada: «llegada» al final de cada uno
  // y «salida» al empezar el siguiente. Las de en medio son tus paradas.
  const last = instructions.length - 1;
  return instructions
    .map((item, index) =>
      item.icon === 'arrive' && index < last ? { ...item, text: STOP_TEXT } : item,
    )
    .filter((item, index) => item.icon !== 'depart' || index === 0);
}

export const STOP_TEXT = t('Llegas a tu parada');

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
      // Señal 5 = punto de paso (tu parada).
      text: sign === 5 ? STOP_TEXT : item.text?.trim() || textFromIcon(icon, road),
      road,
      atDistanceM: cumulative[Math.max(0, Math.min(startIndex, cumulative.length - 1))] ?? 0,
    };
  });
}

export function formatInstructionDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return t('ahora');
  return formatManeuverDistance(meters);
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

// Maniobra que viene justo después de la próxima, solo si está tan cerca que
// conviene anunciarla ya ("Luego, gira a la derecha").
export function followingInstruction(
  instructions: RouteInstruction[] | undefined,
  upcoming: RouteInstruction | null,
  maxGapM = 400,
) {
  if (!instructions || !upcoming) return null;
  const index = instructions.findIndex((item) => item.atDistanceM === upcoming.atDistanceM);
  const next = index >= 0 ? instructions[index + 1] : undefined;
  if (!next || next.atDistanceM - upcoming.atDistanceM > maxGapM) return null;
  return next;
}

// Texto que se dice en voz alta según lo que falta para la maniobra.
// La distancia como se pronuncia: «300 metros», «1,5 kilómetros», «500 feet».
function spokenDistance(meters: number) {
  const [value, unit] = formatInstructionDistance(meters).split(' ');
  const words: Record<string, string> = {
    m: t('metros'),
    km: t('kilómetros'),
    ft: t('pies'),
    mi: t('millas'),
  };
  return unit ? `${value} ${words[unit] ?? unit}` : value;
}

// Abreviaturas de las calles como se dicen («C. Mercedes» → «calle Mercedes»).
const SPOKEN_ABBREVIATIONS: [RegExp, string][] = [
  [/\bAv(?:da)?\.\s*/g, 'avenida '],
  [/\bAutop\.\s*/g, 'autopista '],
  [/\bCarr\.\s*/g, 'carretera '],
  [/\bC\/\s*/g, 'calle '],
  [/(^|[\s(])C\.\s+/g, '$1calle '],
  [/\bProl\.\s*/g, 'prolongación '],
  [/\bEsq\.\s*/gi, 'esquina '],
  [/\bDr\.\s*/g, 'doctor '],
];

export function speakableStreet(text: string) {
  return SPOKEN_ABBREVIATIONS.reduce((out, [pattern, word]) => out.replace(pattern, word), text);
}

export function spokenInstruction(text: string, remainingM: number) {
  const spoken = speakableStreet(text);
  if (remainingM <= 60) return spoken;
  return t('En {0}, {1}{2}', spokenDistance(remainingM), spoken.charAt(0).toLowerCase(), spoken.slice(1));
}
