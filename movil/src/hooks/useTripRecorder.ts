import { useEffect, useRef } from 'react';

import { startBackgroundTracking, takePendingPoints } from '@/src/lib/background-location';
import { submitTripSpeedRecords } from '@/src/lib/highway-records';
import { useTrips, type Trip } from '@/src/store/trips';

// Conecta el GPS con la grabación de rutas: arranca el servicio de fondo,
// fusiona los puntos pendientes y publica los récords al terminar el viaje.
export function useTripRecorder(
  location: { latitude: number; longitude: number; speedKmh?: number | null },
  vehicleName?: string,
) {
  const hydrate = useTrips((state) => state.hydrate);
  const recordPoint = useTrips((state) => state.recordPoint);
  const markRecordsSubmitted = useTrips((state) => state.markRecordsSubmitted);
  const active = useTrips((state) => state.active);
  const activeId = active?.id ?? null;
  const hydrated = useTrips((state) => state.hydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const mergedRef = useRef(false);
  useEffect(() => {
    if (mergedRef.current) return;
    mergedRef.current = true;
    void (async () => {
      await startBackgroundTracking();
      const pending = await takePendingPoints();
      for (const point of pending) recordPoint(point);
    })();
  }, [recordPoint]);

  const { latitude, longitude, speedKmh = null } = location;
  useEffect(() => {
    recordPoint({ latitude, longitude, speedKmh });
  }, [latitude, longitude, speedKmh, recordPoint]);

  // Al terminar un viaje se publican sus récords si hay conexión.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = activeId !== null;
    if (!wasActive || activeId) return;
    const ended = useTrips.getState().trips[0];
    if (!ended || ended.recordsSubmitted) return;
    void submitTripSpeedRecords(ended, vehicleName).then((done) => {
      if (done) markRecordsSubmitted(ended.id);
    });
  }, [activeId, vehicleName, markRecordsSubmitted]);

  // Reintento de envíos pendientes (por ejemplo, sin conexión al terminar).
  const retriedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || retriedRef.current) return;
    retriedRef.current = true;
    const pendingTrip = useTrips
      .getState()
      .trips.find((trip: Trip) => trip.endedAt && !trip.recordsSubmitted);
    if (!pendingTrip) return;
    void submitTripSpeedRecords(pendingTrip, vehicleName).then((done) => {
      if (done) markRecordsSubmitted(pendingTrip.id);
    });
  }, [hydrated, vehicleName, markRecordsSubmitted]);

  return { active };
}
