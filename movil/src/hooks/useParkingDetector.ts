import { useEffect, useRef } from 'react';

import { useParking, type ParkingSpot } from '@/src/store/parking';
import { useTrips } from '@/src/store/trips';

const MOVE_KMH = 10;
const PARK_AFTER_MS = 90_000;

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceToSpotMeters(
  location: { latitude: number; longitude: number },
  spot: ParkingSpot | null,
) {
  if (!spot) return null;
  return haversineMeters(location, spot);
}

// Guarda el punto donde el coche quedó aparcado: el último punto en movimiento
// cuando pasan 3 minutos por debajo de 2,5 km/h.
export function useParkingDetector(location: {
  latitude: number;
  longitude: number;
  speedKmh?: number | null;
}) {
  const setSpot = useParking((state) => state.setSpot);
  const lastMovingRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const lastMovingAtRef = useRef(0);
  const seededRef = useRef(false);

  const { latitude, longitude, speedKmh } = location;

  // Si la app se abrió con el coche ya aparcado, partimos del último punto
  // registrado en la ruta más reciente.
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const lastTrip = useTrips.getState().trips[0];
    const lastPoint = lastTrip?.points[lastTrip.points.length - 1];
    if (!lastPoint || Date.now() - lastPoint.at > 24 * 3_600_000) return;
    if (lastMovingRef.current) return;
    lastMovingRef.current = { latitude: lastPoint.latitude, longitude: lastPoint.longitude };
    lastMovingAtRef.current = lastPoint.at;
  }, []);

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
