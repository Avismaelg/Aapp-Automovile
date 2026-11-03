import { haversineMeters } from "@/src/lib/geo";
import {
  evaluateStop,
  OWN_CAR_RADIUS_M,
  reconcileSpotWithMotion,
  type GeoPoint,
  type MotionFix,
  type MotionHint,
  type Stop,
  type StopSample,
} from "@/src/lib/parking-logic";

// Detector de aparcamiento sin React: lo usa useParkingDetector en la app y
// el simulador de un día completo en los tests. Ver parking-logic.ts para las
// reglas de qué parada es un aparcamiento.

export type Spot = GeoPoint & { at: number };

export type DetectorDeps = {
  getSpot: () => Spot | null;
  setSpot: (spot: Spot) => void;
  clearSpot: () => void;
  motionSince: (sinceMs: number) => MotionHint[];
  // El simulador acelera las esperas (p. ej. 0.15).
  timeScale?: () => number;
};

export type DetectorFix = GeoPoint & {
  speedKmh: number | null;
  accuracy?: number | null;
  at: number;
};

const MOVE_KMH = 10;
// Para contar como «en marcha» la posición tiene que avanzar esto con
// velocidad de coche: el GPS de interior da velocidades falsas sin avanzar.
const MOVE_CONFIRM_M = 40;
// Fixes con más error que esto se ignoran.
const MAX_ACCURACY_M = 50;
const MAX_SAMPLES = 400;
// Sin muestras del GPS en este tiempo la parada pendiente ya no dice nada:
// de ese hueco se encargan el final del viaje grabado y el sensor.
const STALE_STOP_MS = 15 * 60_000;
const SIM_STALE_STOP_MS = 60_000;
// Conduciendo a más de esto del aparcamiento guardado, el coche ya no está allí.
const LEFT_SPOT_M = 60;
// Un aparcamiento nuevo a menos de esto del guardado no lo cambia.
const SAME_SPOT_M = 25;

export class ParkingDetector {
  private stop: Stop | null = null;
  private lastMoving: Stop | null = null;
  private samples: StopSample[] = [];
  private anchor: DetectorFix | null = null;
  private moving = false;
  destination: GeoPoint | null = null;

  constructor(private deps: DetectorDeps) {}

  setDestination(destination: GeoPoint | null) {
    this.destination = destination;
  }

  get pending() {
    return this.stop != null;
  }

  reset() {
    this.stop = null;
    this.lastMoving = null;
    this.samples = [];
    this.anchor = null;
    this.moving = false;
  }

  private scale() {
    return this.deps.timeScale?.() ?? 1;
  }

  private staleMs() {
    return this.scale() < 1 ? SIM_STALE_STOP_MS : STALE_STOP_MS;
  }

  onFix(fix: DetectorFix) {
    if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return;
    const speed = fix.speedKmh ?? 0;
    const point = { latitude: fix.latitude, longitude: fix.longitude };

    if (speed >= MOVE_KMH) {
      // Se confirma que vas en marcha cuando avanzas de verdad.
      if (!this.moving) {
        if (!this.anchor) this.anchor = fix;
        if (haversineMeters(this.anchor, point) < MOVE_CONFIRM_M) return;
        this.moving = true;
      }
      this.lastMoving = { ...point, at: fix.at };
      // Vuelves a ir en coche: la parada era tráfico.
      this.stop = null;
      this.samples = [];
      // Conduciendo lejos del punto aparcado, vas en el coche.
      const spot = this.deps.getSpot();
      if (spot && haversineMeters(spot, point) > LEFT_SPOT_M)
        this.deps.clearSpot();
      return;
    }

    this.anchor = null;
    this.moving = false;
    if (!this.lastMoving) return;
    // Hueco largo sin GPS: lo anterior ya no vale para esta parada.
    const previousAt =
      this.samples[this.samples.length - 1]?.at ?? this.lastMoving.at;
    if (fix.at - previousAt > this.staleMs()) {
      this.reset();
      return;
    }
    if (!this.stop) this.stop = this.lastMoving;
    this.samples.push({ ...point, speedKmh: speed, at: fix.at });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    this.evaluate(fix.at);
  }

  // Se llama también periódicamente: parado, el GPS deja de emitir.
  evaluate(now: number) {
    const stop = this.stop;
    if (!stop) return;
    const lastSampleAt = this.samples[this.samples.length - 1]?.at ?? stop.at;
    if (now - lastSampleAt > this.staleMs()) {
      this.reset();
      return;
    }
    const decision = evaluateStop({
      stop,
      samples: this.samples,
      motion: this.deps.motionSince(stop.at - 120_000),
      now,
      destination: this.destination,
      timeScale: this.scale(),
    });
    if (decision.kind === "pending") return;
    if (decision.kind === "parked") {
      const existing = this.deps.getSpot();
      if (!existing || haversineMeters(existing, stop) >= SAME_SPOT_M) {
        this.deps.setSpot({
          latitude: stop.latitude,
          longitude: stop.longitude,
          at: stop.at,
        });
      }
      this.lastMoving = null;
    }
    this.stop = null;
    this.samples = [];
  }
}

// Un viaje terminado hace más de esto ya no indica dónde está el coche.
const TRIP_PARKING_MAX_AGE_MS = 24 * 3_600_000;

// Con la app cerrada el GPS de fondo da un punto cada ~15 s: el último en
// marcha puede quedar 50-100 m antes de donde paraste. El aviso del sensor al
// bajar del coche guarda la ubicación de ese momento, más exacta.
const EXIT_MATCH_BEFORE_MS = 2 * 60_000;
const EXIT_MATCH_AFTER_MS = 10 * 60_000;
const EXIT_MAX_ACCURACY_M = 50;
const EXIT_MAX_SHIFT_M = 250;

// Tras el final del viaje, ¿el primer aviso decisivo del sensor es volver a
// ir en vehículo (sin haber andado antes)? Sin avisos, no se sabe: false.
export function continuedDriving(endedAt: number, motion: MotionFix[]) {
  const next = [...motion]
    .sort((a, b) => a.at - b.at)
    .find(
      (event) =>
        event.at > endedAt &&
        ((event.type === "vehicle" && event.transition === "enter") ||
          (event.type === "foot" && event.transition === "enter")),
    );
  return next?.type === "vehicle";
}

export function refineWithExit(spot: Spot, motion: MotionFix[]): Spot {
  const exit = motion.find(
    (event) =>
      ((event.type === "vehicle" && event.transition === "exit") ||
        (event.type === "foot" && event.transition === "enter")) &&
      event.latitude != null &&
      event.longitude != null &&
      (event.accuracy ?? Infinity) <= EXIT_MAX_ACCURACY_M &&
      event.at >= spot.at - EXIT_MATCH_BEFORE_MS &&
      event.at <= spot.at + EXIT_MATCH_AFTER_MS,
  );
  if (!exit) return spot;
  const at = {
    latitude: exit.latitude as number,
    longitude: exit.longitude as number,
  };
  if (haversineMeters(spot, at) > EXIT_MAX_SHIFT_M) return spot;
  return { ...at, at: spot.at };
}

// Al abrir la app: el final del último viaje grabado (también en segundo
// plano) es donde quedó el coche, salvo que haya un aparcamiento más nuevo.
export function spotFromTripEnd(
  trip:
    | { id: string; startedAt?: number; endedAt: number | null; points: GeoPoint[]; test?: boolean }
    | undefined,
  spot: Spot | null,
  seenTripId: string | null,
  now: number,
  motion: MotionFix[] = [],
): { spot: Spot | null; seen: string | null } {
  const end = trip?.points[trip.points.length - 1];
  if (
    !trip ||
    !end ||
    !trip.endedAt ||
    now - trip.endedAt > TRIP_PARKING_MAX_AGE_MS
  ) {
    return { spot: null, seen: null };
  }
  if (seenTripId === trip.id) return { spot: null, seen: null };
  // Los viajes de prueba (simulador) nunca mueven el coche.
  if (trip.test) return { spot: null, seen: trip.id };
  if (spot && spot.at >= trip.endedAt) return { spot: null, seen: trip.id };
  // Un viaje que empezó lejos de tu coche aparcado no fue en tu coche (taxi,
  // de copiloto): el coche sigue donde estaba.
  const start = trip.points[0];
  if (spot && start && haversineMeters(start, spot) > OWN_CAR_RADIUS_M) {
    return { spot: null, seen: trip.id };
  }
  // El viaje se cortó (p. ej. sin GPS en un tapón) pero el sensor dice que
  // seguiste en el vehículo sin echar a andar: ahí no aparcaste.
  if (continuedDriving(trip.endedAt, motion)) return { spot: null, seen: trip.id };
  return {
    spot: refineWithExit(
      { latitude: end.latitude, longitude: end.longitude, at: trip.endedAt },
      motion,
    ),
    seen: trip.id,
  };
}

export { reconcileSpotWithMotion, type MotionFix };
