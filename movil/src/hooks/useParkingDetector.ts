import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { getMotionEvents } from "@/modules/motion";
import { haversineMeters } from "@/src/lib/geo";
import { whenHydrated } from "@/src/lib/hydration";
import {
  ParkingDetector,
  reconcileSpotWithMotion,
  spotFromTripEnd,
} from "@/src/lib/parking-detector";
import type { GeoPoint } from "@/src/lib/parking-logic";
import {
  isSimulating,
  simMotionEvents,
  useSimulator,
} from "@/src/lib/simulator";
import { useParking, type ParkingSpot } from "@/src/store/parking";
import { useTrips } from "@/src/store/trips";

// Parado sin señales nuevas del GPS (quieto, el GPS deja de emitir): se
// reevalúa igualmente cada poco.
const EVALUATE_EVERY_MS = 10_000;
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

function createDetector() {
  return new ParkingDetector({
    getSpot: () => useParking.getState().spot,
    setSpot: (spot) => useParking.getState().setSpot(spot),
    clearSpot: () => useParking.getState().clearSpot(),
    motionSince: (since) =>
      isSimulating() ? simMotionEvents(since) : getMotionEvents(since),
    timeScale: () => (isSimulating() ? SIM_TIME_SCALE : 1),
  });
}

// Guarda dónde quedó aparcado el coche. Una parada solo cuenta como
// aparcamiento con pruebas de que bajaste del coche (sensor de actividad,
// llegar al destino, alejarte andando o mucho rato quieto): en un tapón el
// GPS da lo mismo que aparcado. Ver src/lib/parking-detector.ts.
//
// Al abrir la app también se usa el final del último viaje grabado y los
// avisos del sensor guardados con la app cerrada.
export function useParkingDetector(
  location: {
    latitude: number;
    longitude: number;
    speedKmh?: number | null;
    accuracy?: number | null;
  },
  destination?: GeoPoint | null,
) {
  const [detector] = useState(createDetector);
  const lastTrip = useTrips((state) => state.trips[0]);

  const { latitude, longitude, speedKmh = null, accuracy = null } = location;

  useEffect(() => {
    if (!lastTrip) return;
    let cancelled = false;
    void whenHydrated(useParking).then(() => {
      if (cancelled) return;
      const { spot, seenTripId, markTripSeen, setSpot } = useParking.getState();
      const now = Date.now();
      const result = spotFromTripEnd(
        lastTrip,
        spot,
        seenTripId,
        now,
        getMotionEvents(now - MOTION_WINDOW_MS),
      );
      if (result.seen) markTripSeen(result.seen);
      if (result.spot) setSpot(result.spot);
    });
    return () => {
      cancelled = true;
    };
  }, [lastTrip]);

  // Con la app cerrada: corrige el aparcamiento con los avisos del sensor.
  useEffect(() => {
    const reconcile = () => {
      if (isSimulating()) return;
      void whenHydrated(useParking).then(() => {
        const now = Date.now();
        const { spot, setSpot, clearSpot } = useParking.getState();
        // Viajes grabados: distinguen tu coche de un taxi o de ir de copiloto.
        const drives = useTrips.getState().trips.map((trip) => ({
          startedAt: trip.startedAt,
          start: trip.points[0] ?? null,
          test: trip.test,
        }));
        const decision = reconcileSpotWithMotion(
          spot,
          getMotionEvents(now - MOTION_WINDOW_MS),
          now,
          drives,
        );
        if (decision.kind === "move") setSpot(decision.spot);
        else if (decision.kind === "clear" && !detector.pending) clearSpot();
      });
    };
    reconcile();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") reconcile();
    });
    return () => subscription.remove();
  }, [detector]);

  useEffect(() => {
    detector.setDestination(destination ?? null);
  }, [detector, destination]);

  // Empezar o parar una simulación no debe heredar paradas de antes, y el
  // aparcamiento de la prueba no sustituye al real: al terminar vuelve el que
  // había antes de simular.
  useEffect(() => {
    let realSpot: ParkingSpot | null | undefined;
    return useSimulator.subscribe((next, previous) => {
      if (next.active === previous.active) return;
      detector.reset();
      const parking = useParking.getState();
      if (next.active) {
        realSpot = parking.spot;
      } else if (realSpot !== undefined) {
        if (realSpot) parking.setSpot(realSpot);
        else parking.clearSpot();
        realSpot = undefined;
      }
    });
  }, [detector]);

  useEffect(() => {
    const timer = setInterval(
      () => detector.evaluate(Date.now()),
      EVALUATE_EVERY_MS,
    );
    return () => clearInterval(timer);
  }, [detector]);

  useEffect(() => {
    detector.onFix({ latitude, longitude, speedKmh, accuracy, at: Date.now() });
  }, [detector, latitude, longitude, speedKmh, accuracy]);
}
