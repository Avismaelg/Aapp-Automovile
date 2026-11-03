import { haversineMeters } from '@/src/lib/geo';

// Decide si una parada es un aparcamiento de verdad o solo un atasco /
// semáforo. Con el coche parado en un tapón el GPS da lo mismo que aparcado,
// así que hacen falta pruebas de que has bajado del coche:
// 1. El sensor de actividad del teléfono dice que has salido del vehículo o
//    que vas a pie (lo más fiable; es lo que usan Maps y Waze).
// 2. Has parado junto al destino de la navegación.
// 3. Sin sensor: te has alejado andando del punto, o llevas mucho rato quieto.

export type GeoPoint = { latitude: number; longitude: number };

export type StopSample = GeoPoint & { speedKmh: number | null; at: number };

export type MotionHint = {
  type: 'vehicle' | 'foot' | 'still';
  transition: 'enter' | 'exit';
  at: number;
};

export type Stop = GeoPoint & {
  // Momento en que dejó de ir en coche (último instante en movimiento).
  at: number;
};

export type StopDecision =
  | { kind: 'pending' }
  | { kind: 'parked'; reason: 'motion' | 'destination' | 'walked-away' | 'long-stop' }
  | { kind: 'driving' };

// Por encima de esto vuelves a ir en coche: la parada era tráfico.
export const RESUME_KMH = 15;
// Más rápido que esto no es andar.
const WALK_MAX_KMH = 8;
const WALK_MIN_KMH = 2.5;
const DESTINATION_RADIUS_M = 120;
const DESTINATION_STOP_MS = 45_000;
// Sin sensor de actividad: alejarse andando del coche.
const WALK_AWAY_M = 120;
const WALK_AWAY_MIN_MS = 90_000;
// Sin sensor de actividad: parado en el mismo sitio mucho rato.
const LONG_STOP_RADIUS_M = 40;
const LONG_STOP_MS = 10 * 60_000;
// Con el sensor diciendo "en vehículo": solo un rato muy largo (por si se
// perdió el aviso de salida).
const IN_VEHICLE_STOP_MS = 30 * 60_000;
// Un aviso de "a pie" puede llegar un poco antes de que el GPS registre la
// parada (el sensor y el GPS no van sincronizados).
const MOTION_SLACK_MS = 60_000;

// Estado según el sensor en un instante: el último aviso relevante manda.
// «Fuera del vehículo» sin echar a andar NO es bajarse: en un tapón el sensor
// lo dice con el coche parado y tú dentro. Solo andar cuenta como «a pie».
export function motionStateAt(
  events: MotionHint[],
  at: number,
): 'vehicle' | 'vehicle-exit' | 'foot' | 'unknown' {
  let state: 'vehicle' | 'vehicle-exit' | 'foot' | 'unknown' = 'unknown';
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    if (event.at > at) break;
    if (event.type === 'vehicle') state = event.transition === 'enter' ? 'vehicle' : 'vehicle-exit';
    else if (event.type === 'foot' && event.transition === 'enter') state = 'foot';
  }
  return state;
}

// Tras bajar del vehículo hay que echar a andar en este tiempo; si no, era
// un tapón o un semáforo largo.
export const WALK_AFTER_EXIT_MS = 10 * 60_000;

// Actividad más reciente según el sensor, incluido «quieto». Ojo: en un
// semáforo el sensor también puede decir «quieto» yendo en coche, así que
// solo sirve para no EMPEZAR viajes, no para darlos por terminados.
export function motionActivityAt(
  events: MotionHint[],
  at: number,
): 'vehicle' | 'foot' | 'still' | 'unknown' {
  let state: 'vehicle' | 'foot' | 'still' | 'unknown' = 'unknown';
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    if (event.at > at) break;
    // Salir del vehículo sin echar a andar es quedarse quieto (un tapón).
    if (event.type === 'vehicle') state = event.transition === 'enter' ? 'vehicle' : 'still';
    else if (event.transition === 'enter') state = event.type;
  }
  return state;
}

// Tras ir en un vehículo, «quieto» durante este tiempo suele ser tráfico:
// no impide retomar la grabación al volver a moverse.
export const STILL_IN_TRAFFIC_MS = 30 * 60_000;

// ¿Impide el sensor empezar un viaje ahora? A pie, siempre. Quieto, solo si
// hace rato que no vas en un vehículo (dentro de casa el GPS da velocidades
// falsas); justo después de un tapón no.
export function motionBlocksStart(events: MotionHint[], at: number): boolean {
  const state = motionActivityAt(events, at);
  if (state === 'foot') return true;
  if (state !== 'still') return false;
  return !events.some(
    (event) => event.type === 'vehicle' && event.at <= at && at - event.at <= STILL_IN_TRAFFIC_MS,
  );
}

export function evaluateStop({
  stop,
  samples,
  motion,
  now,
  destination,
  timeScale = 1,
}: {
  stop: Stop;
  // Muestras GPS desde la parada.
  samples: StopSample[];
  motion: MotionHint[];
  now: number;
  destination?: GeoPoint | null;
  // El simulador acelera los tiempos (p. ej. 0.15) para no esperar minutos.
  timeScale?: number;
}): StopDecision {
  const after = samples.filter((sample) => sample.at > stop.at);
  if (after.some((sample) => (sample.speedKmh ?? 0) >= RESUME_KMH)) return { kind: 'driving' };

  // Bajarse = echar a andar. «Fuera del vehículo» solo no basta (tapones).
  const left = motion.some(
    (event) =>
      event.at >= stop.at - MOTION_SLACK_MS && event.type === 'foot' && event.transition === 'enter',
  );
  if (left) return { kind: 'parked', reason: 'motion' };

  const stoppedMs = (now - stop.at) / timeScale;
  if (
    destination &&
    haversineMeters(stop, destination) <= DESTINATION_RADIUS_M &&
    stoppedMs >= DESTINATION_STOP_MS
  ) {
    return { kind: 'parked', reason: 'destination' };
  }

  // El sensor sigue diciendo que vas en el coche (o salió del vehículo sin
  // que echaras a andar): es un atasco.
  const state = motionStateAt(motion, now);
  if (state === 'vehicle' || state === 'vehicle-exit') {
    return stoppedMs >= IN_VEHICLE_STOP_MS ? { kind: 'parked', reason: 'long-stop' } : { kind: 'pending' };
  }

  const last = after[after.length - 1];
  if (last && stoppedMs >= WALK_AWAY_MIN_MS) {
    const away = haversineMeters(stop, last);
    const slow = after.every((sample) => (sample.speedKmh ?? 0) <= WALK_MAX_KMH);
    // Andar es un ritmo constante; en un tapón se alterna parado y avanzar.
    const moving = after.filter((sample) => (sample.speedKmh ?? 0) >= WALK_MIN_KMH).length;
    const halted = after.filter((sample) => (sample.speedKmh ?? 0) < 1).length;
    const steady = moving >= after.length * 0.7 && halted <= after.length * 0.2;
    if (slow && steady && away >= WALK_AWAY_M) return { kind: 'parked', reason: 'walked-away' };
  }

  if (stoppedMs >= LONG_STOP_MS) {
    const stayed = after.every((sample) => haversineMeters(stop, sample) <= LONG_STOP_RADIUS_M);
    if (stayed) return { kind: 'parked', reason: 'long-stop' };
  }
  return { kind: 'pending' };
}

export type MotionFix = MotionHint & Partial<GeoPoint> & { accuracy?: number; fixAt?: number };

// Ubicación guardada con un aviso del sensor: solo vale si es precisa y
// reciente respecto al aviso (la última conocida puede ser de hace horas).
const FIX_MAX_ACCURACY_M = 80;
const FIX_MAX_AGE_MS = 5 * 60_000;

// Viajes grabados por Caravana (para saber si un vehículo era tu coche).
export type DriveHint = { startedAt: number; start: GeoPoint | null; test?: boolean };

// Subir a un vehículo a más de esto de tu coche aparcado no es subir a tu
// coche (taxi, autobús, el coche de un amigo): el aparcamiento no se toca.
export const OWN_CAR_RADIUS_M = 400;
const ENTER_FIX_MAX_ACCURACY_M = 150;
const DRIVE_MATCH_MS = 15 * 60_000;

function metersBetween(a: GeoPoint, b: GeoPoint) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ¿Ese «subir a un vehículo» fue subir a tu coche?
// - Con aparcamiento guardado: si la subida fue junto al coche (por la
//   ubicación del aviso o por dónde empezó el viaje grabado).
// - Sin aparcamiento: solo si Caravana grabó un viaje en ese momento.
export function enteredOwnCar(
  spot: GeoPoint | null,
  enter: MotionFix,
  drives: DriveHint[],
): boolean {
  const near = drives.filter(
    (drive) => !drive.test && Math.abs(drive.startedAt - enter.at) <= DRIVE_MATCH_MS,
  );
  if (!spot) return near.length > 0;
  const enterFix =
    enter.latitude != null &&
    enter.longitude != null &&
    enter.accuracy != null &&
    enter.accuracy <= ENTER_FIX_MAX_ACCURACY_M &&
    Math.abs(enter.at - (enter.fixAt ?? Infinity)) <= FIX_MAX_AGE_MS
      ? { latitude: enter.latitude, longitude: enter.longitude }
      : null;
  if (enterFix) return metersBetween(enterFix, spot) <= OWN_CAR_RADIUS_M;
  return near.some((drive) => drive.start != null && metersBetween(drive.start, spot) <= OWN_CAR_RADIUS_M);
}

export type SpotReconcile =
  | { kind: 'keep' }
  | { kind: 'move'; spot: GeoPoint & { at: number } }
  | { kind: 'clear' };

// Con la app cerrada el GPS de fondo puede no haber grabado nada (Android lo
// mata). El sensor de actividad sigue funcionando: si después del
// aparcamiento guardado subiste a TU coche y luego bajaste, el coche está
// donde bajaste. Si subiste y no consta dónde bajaste, el punto viejo ya no
// es fiable y se quita (mejor sin aparcamiento que uno falso). Subir a otro
// vehículo (taxi, autobús, de copiloto) no mueve tu coche.
const hasGoodFix = (event: MotionFix) =>
  event.latitude != null &&
  event.longitude != null &&
  (event.accuracy ?? 0) <= FIX_MAX_ACCURACY_M &&
  Math.abs(event.at - (event.fixAt ?? event.at)) <= FIX_MAX_AGE_MS;

// Dónde bajaste del coche tras subir en `after`: una salida del vehículo que
// va seguida de echar a andar (sin volver a subir antes). Una salida sin
// andar después es un tapón y no mueve el coche. El punto es el de la salida
// si es bueno; si no, el del primer paso a pie.
function findParkingExit(sorted: MotionFix[], after: number): MotionFix | undefined {
  const events = sorted.filter((event) => event.at > after);
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.type === 'foot' && event.transition === 'enter') {
      if (hasGoodFix(event)) return event;
      continue;
    }
    if (event.type !== 'vehicle' || event.transition !== 'exit') continue;
    const walk = events.slice(i + 1).find(
      (next) =>
        (next.type === 'vehicle' && next.transition === 'enter') ||
        (next.type === 'foot' && next.transition === 'enter'),
    );
    if (!walk || walk.type !== 'foot' || walk.at - event.at > WALK_AFTER_EXIT_MS) continue;
    if (hasGoodFix(event)) return event;
    if (hasGoodFix(walk)) return walk;
  }
  return undefined;
}

export function reconcileSpotWithMotion(
  spot: (GeoPoint & { at: number }) | null,
  events: MotionFix[],
  now: number,
  drives: DriveHint[] = [],
): SpotReconcile {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const since = spot?.at ?? 0;
  const enter = sorted.find(
    (event) =>
      event.type === 'vehicle' &&
      event.transition === 'enter' &&
      event.at > since + 60_000 &&
      enteredOwnCar(spot, event, drives),
  );
  if (!enter) return { kind: 'keep' };

  const exit = findParkingExit(sorted, enter.at);
  // ¿Volvió a subir después de esa bajada? Entonces se sigue buscando.
  if (exit) {
    const later = reconcileSpotWithMotion(
      { latitude: exit.latitude as number, longitude: exit.longitude as number, at: exit.at },
      sorted.filter((event) => event.at > exit.at),
      now,
      drives,
    );
    if (later.kind !== 'keep') return later;
    return {
      kind: 'move',
      spot: { latitude: exit.latitude as number, longitude: exit.longitude as number, at: exit.at },
    };
  }
  // Subió hace poco y sigue en el coche: el aparcamiento viejo sobra.
  if (!spot) return { kind: 'keep' };
  return now - enter.at > 0 ? { kind: 'clear' } : { kind: 'keep' };
}
