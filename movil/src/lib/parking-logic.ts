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
export function motionStateAt(events: MotionHint[], at: number): 'vehicle' | 'foot' | 'unknown' {
  let state: 'vehicle' | 'foot' | 'unknown' = 'unknown';
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    if (event.at > at) break;
    if (event.type === 'vehicle') state = event.transition === 'enter' ? 'vehicle' : 'foot';
    else if (event.type === 'foot' && event.transition === 'enter') state = 'foot';
  }
  return state;
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

  const left = motion.some(
    (event) =>
      event.at >= stop.at - MOTION_SLACK_MS &&
      ((event.type === 'vehicle' && event.transition === 'exit') ||
        (event.type === 'foot' && event.transition === 'enter')),
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

  // El sensor sigue diciendo que vas en el coche: es un atasco.
  if (motionStateAt(motion, now) === 'vehicle') {
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

export type SpotReconcile =
  | { kind: 'keep' }
  | { kind: 'move'; spot: GeoPoint & { at: number } }
  | { kind: 'clear' };

// Con la app cerrada el GPS de fondo puede no haber grabado nada (Android lo
// mata). El sensor de actividad sigue funcionando: si después del
// aparcamiento guardado subiste a un vehículo y luego bajaste, el coche está
// donde bajaste. Si subiste y no consta dónde bajaste, el punto viejo ya no
// es fiable y se quita (mejor sin aparcamiento que uno falso).
export function reconcileSpotWithMotion(
  spot: (GeoPoint & { at: number }) | null,
  events: MotionFix[],
  now: number,
): SpotReconcile {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const since = spot?.at ?? 0;
  const enter = sorted.find(
    (event) => event.type === 'vehicle' && event.transition === 'enter' && event.at > since + 60_000,
  );
  if (!enter) return { kind: 'keep' };

  const exit = sorted.find(
    (event) =>
      event.at > enter.at &&
      ((event.type === 'vehicle' && event.transition === 'exit') ||
        (event.type === 'foot' && event.transition === 'enter')) &&
      event.latitude != null &&
      event.longitude != null &&
      (event.accuracy ?? 0) <= FIX_MAX_ACCURACY_M &&
      Math.abs(event.at - (event.fixAt ?? event.at)) <= FIX_MAX_AGE_MS,
  );
  // ¿Volvió a subir después de esa bajada? Entonces se sigue buscando.
  if (exit) {
    const later = reconcileSpotWithMotion(
      { latitude: exit.latitude as number, longitude: exit.longitude as number, at: exit.at },
      sorted.filter((event) => event.at > exit.at),
      now,
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
