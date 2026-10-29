import { useEffect, useRef } from 'react';

import { haversineMeters } from '@/src/lib/geo';
import { whenHydrated } from '@/src/lib/hydration';
import { useParking, type ParkingSpot } from '@/src/store/parking';
import { useTrips } from '@/src/store/trips';

const MOVE_KMH = 10;
const PARK_AFTER_MS = 90_000;
// Un viaje terminado hace más de esto ya no indica dónde está el coche.
const TRIP_PARKING_MAX_AGE_MS = 24 * 3_600_000;

export function distanceToSpotMeters(
  location: { latitude: number; longitude: number },
  spot: ParkingSpot | null,
) {
  if (!spot) return null;
  return haversineMeters(location, spot);
}

// Guarda el punto donde el coche quedó aparcado: el último punto en movimiento
// cuando pasan 90 s por debajo de 10 km/h, o el final del último viaje grabado
// (también los grabados en segundo plano con la app cerrada).
export function useParkingDetector(location: {
  latitude: number;
  longitude: number;
  speedKmh?: number | null;
}) {
  const setSpot = useParking((state) => state.setSpot);
  const lastMovingRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastMovingAtRef = useRef(0);
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

  useEffect(() => {
    const speed = speedKmh ?? 0;
    const now = Date.now();

    if (speed >= MOVE_KMH) {
      lastMovingRef.current = { latitude, longitude };
      lastMovingAtRef.current = now;

      // Si ya estás conduciendo lejos del punto aparcado, el coche se movió:
      // se olvida el aparcamiento viejo.
      const spot = useParking.getState().spot;
      if (spot && haversineMeters(spot, { latitude, longitude }) > 200) {
        useParking.getState().clearSpot();
      }
      return;
    }

    if (!lastMovingRef.current || !lastMovingAtRef.current) return;
    if (now - lastMovingAtRef.current < PARK_AFTER_MS) return;

    const parked = lastMovingRef.current;
    const existing = useParking.getState().spot;
    const unchanged = existing
      ? haversineMeters(existing, parked) < 25
      : false;
    if (!unchanged) {
      setSpot({ latitude: parked.latitude, longitude: parked.longitude, at: now });
    }
    lastMovingRef.current = null;
    lastMovingAtRef.current = 0;
  }, [latitude, longitude, speedKmh, setSpot]);
}
