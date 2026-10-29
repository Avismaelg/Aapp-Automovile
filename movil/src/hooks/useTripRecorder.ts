import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { submitTripSpeedRecords } from '@/src/lib/highway-records';
import { useTrips } from '@/src/store/trips';
import { useSession } from '@/src/store/session';

// Con la app abierta el GPS en primer plano ya graba; los lotes de fondo se
// recogen igualmente para que no se acumulen en el almacenamiento.
const INGEST_EVERY_MS = 2 * 60_000;

// Conecta el GPS con la grabación de rutas: fusiona los puntos grabados en
// segundo plano y publica los récords de cada viaje terminado.
export function useTripRecorder(
  location: { latitude: number; longitude: number; speedKmh?: number | null },
  vehicleName?: string,
  options?: { walking?: boolean },
) {
  const hydrate = useTrips((state) => state.hydrate);
  const ingestBackground = useTrips((state) => state.ingestBackground);
  const recordPoint = useTrips((state) => state.recordPoint);
  const markRecordsSubmitted = useTrips((state) => state.markRecordsSubmitted);
  const stopTrip = useTrips((state) => state.stopTrip);
  const active = useTrips((state) => state.active);
  const trips = useTrips((state) => state.trips);
  const hydrated = useTrips((state) => state.hydrated);
  const walking = options?.walking ?? false;
  const trackingEnabled = useSession((state) => state.trackingEnabled);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const ingest = () => void ingestBackground();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') ingest();
    });
    const timer = setInterval(ingest, INGEST_EVERY_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [hydrated, ingestBackground]);

  const { latitude, longitude, speedKmh = null } = location;
  useEffect(() => {
    // Caminando o con tracking automático desactivado no se graba ruta de coche.
    if (walking || !trackingEnabled) return;
    recordPoint({ latitude, longitude, speedKmh });
  }, [latitude, longitude, speedKmh, recordPoint, trackingEnabled, walking]);

  // Al empezar a caminar (coche aparcado) se cierra el viaje de coche.
  useEffect(() => {
    if (trackingEnabled && !walking) return;
    if (useTrips.getState().active) void stopTrip();
  }, [trackingEnabled, walking, stopTrip]);

  // Publica los récords de cada viaje terminado sin enviar: el que acaba de
  // cerrar, los recuperados del segundo plano y los que fallaron sin conexión.
  const submittingRef = useRef(new Set<string>());
  useEffect(() => {
    if (!hydrated) return;
    for (const trip of trips) {
      if (!trip.endedAt || trip.recordsSubmitted || submittingRef.current.has(trip.id)) continue;
      submittingRef.current.add(trip.id);
      void submitTripSpeedRecords(trip, vehicleName)
        .then((done) => {
          if (done) markRecordsSubmitted(trip.id);
        })
        .catch(() => undefined)
        .finally(() => submittingRef.current.delete(trip.id));
    }
  }, [hydrated, trips, vehicleName, markRecordsSubmitted]);

  return { active };
}
