import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getMotionEvents } from '@/modules/motion';
import { haversineMeters } from '@/src/lib/geo';
import { whenHydrated } from '@/src/lib/hydration';
import {
  evaluateStop,
  reconcileSpotWithMotion,
  type GeoPoint,
  type MotionHint,
  type Stop,
  type StopSample,
} from '@/src/lib/parking-logic';
import { isSimulating, simMotionEvents } from '@/src/lib/simulator';
import { useParking, type ParkingSpot } from '@/src/store/parking';
import { useTrips } from '@/src/store/trips';

const MOVE_KMH = 10;
// Un viaje terminado hace más de esto ya no indica dónde está el coche.
const TRIP_PARKING_MAX_AGE_MS = 24 * 3_600_000;
// Parado sin señales nuevas del GPS (quieto, el GPS deja de emitir): se
// reevalúa igualmente cada poco.
const EVALUATE_EVERY_MS = 10_000;
const MAX_SAMPLES = 400;
// El simulador comprime los tiempos de espera para no esperar minutos.
const SIM_TIME_SCALE = 0.15;
// Sensor: eventos de las últimas 48 h.
const MOTION_WINDOW_MS = 48 * 3_600_000;

export function distanceToSpotMeters(
  location: { latitude: number; longitude: number },
  spot: ParkingSpot | null,
) {
  if (!spot) return null;
  return haversineMeters(location, spot);
}

function motionSince(sinceMs: number): MotionHint[] {
  return isSimulating() ? simMotionEvents(sinceMs) : getMotionEvents(sinceMs);
}

type DetectorState = {
  stop: Stop | null;
  lastMoving: Stop | null;
  samples: StopSample[];
  destination: GeoPoint | null;
};

// Evalúa la parada en curso; si es un aparcamiento lo guarda.
function evaluatePending(state: DetectorState, now: number) {
  const stop = state.stop;
  if (!stop) return;
  const decision = evaluateStop({
    stop,
    samples: state.samples,
    motion: motionSince(stop.at - 120_000),
    now,
    destination: state.destination,
    timeScale: isSimulating() ? SIM_TIME_SCALE : 1,
  });
  if (decision.kind === 'pending') return;
  if (decision.kind === 'parked') {
    const existing = useParking.getState().spot;
    if (!existing || haversineMeters(existing, stop) >= 25) {
      useParking.getState().setSpot({ latitude: stop.latitude, longitude: stop.longitude, at: stop.at });
    }
    state.lastMoving = null;
  }
  state.stop = null;
  state.samples = [];
}

// Guarda dónde quedó aparcado el coche. Una parada solo cuenta como
// aparcamiento con pruebas de que bajaste del coche (sensor de actividad,
// llegar al destino, alejarte andando o mucho rato quieto): en un tapón el
// GPS da lo mismo que aparcado. Ver src/lib/parking-logic.ts.
//
// Al abrir la app también se usa el final del último viaje grabado y los
// avisos del sensor guardados con la app cerrada.
export function useParkingDetector(
  location: { latitude: number; longitude: number; speedKmh?: number | null },
  destination?: GeoPoint | null,
) {
  const setSpot = useParking((state) => state.setSpot);
  const detector = useRef<DetectorState>({
    stop: null,
    lastMoving: null,
    samples: [],
    destination: null,
  });
  const lastTrip = useTrips((state) => state.trips[0]);

  const { latitude, longitude, speedKmh } = location;

  useEffect(() => {
    const end = lastTrip?.points[lastTrip.points.length - 1];
    const endedAt = lastTrip?.endedAt;
    if (!lastTrip || !end || !endedAt) return;
    if (Date.now() - endedAt > TRIP_PARKING_MAX_AGE_MS) return;

    let cancelled = false;
    void whenHydrated(useParking).then(() => {
      if (cancelled) return;
      const { spot, seenTripId, markTripSeen } = useParking.getState();
      if (seenTripId === lastTrip.id) return;
      markTripSeen(lastTrip.id);
      if (spot && spot.at >= endedAt) return;
      setSpot({ latitude: end.latitude, longitude: end.longitude, at: endedAt });
    });
    return () => {
      cancelled = true;
    };
  }, [lastTrip, setSpot]);

  // Con la app cerrada: corrige el aparcamiento con los avisos del sensor.
  useEffect(() => {
    const reconcile = () => {
      if (isSimulating()) return;
      void whenHydrated(useParking).then(() => {
        const now = Date.now();
        const { spot, clearSpot } = useParking.getState();
        const decision = reconcileSpotWithMotion(
          spot,
          getMotionEvents(now - MOTION_WINDOW_MS),
          now,
        );
        if (decision.kind === 'move') setSpot(decision.spot);
        else if (decision.kind === 'clear' && !detector.current.stop) clearSpot();
      });
    };
    reconcile();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcile();
    });
    return () => subscription.remove();
  }, [setSpot]);

  useEffect(() => {
    detector.current.destination = destination ?? null;
  }, [destination]);

  useEffect(() => {
    const state = detector.current;
    const timer = setInterval(() => evaluatePending(state, Date.now()), EVALUATE_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const state = detector.current;
    const speed = speedKmh ?? 0;
    const now = Date.now();

    if (speed >= MOVE_KMH) {
      state.lastMoving = { latitude, longitude, at: now };
      // Vuelves a ir en coche: la parada era tráfico.
      state.stop = null;
      state.samples = [];

      // Si ya estás conduciendo y te alejas del punto aparcado, vas en el
      // coche: se olvida el aparcamiento viejo.
      const spot = useParking.getState().spot;
      if (spot && haversineMeters(spot, { latitude, longitude }) > 60) {
        useParking.getState().clearSpot();
      }
      return;
    }

    if (!state.lastMoving) return;
    if (!state.stop) state.stop = state.lastMoving;
    state.samples.push({ latitude, longitude, speedKmh: speed, at: now });
    if (state.samples.length > MAX_SAMPLES) state.samples.shift();
    evaluatePending(state, now);
  }, [latitude, longitude, speedKmh]);
}
