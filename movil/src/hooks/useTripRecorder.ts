import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getMotionEvents } from '@/modules/motion';
import { motionActivityAt, motionBlocksStart } from '@/src/lib/parking-logic';
import { setMotionGates, useTrips } from '@/src/store/trips';
import { useSession } from '@/src/store/session';

// Con la app abierta el GPS en primer plano ya graba; los lotes de fondo se
// recogen igualmente para que no se acumulen en el almacenamiento.
const INGEST_EVERY_MS = 2 * 60_000;
// Cada cuánto se mira si el viaje lleva parado lo bastante para cerrarlo.
const IDLE_CHECK_MS = 30_000;
// Ventana de avisos del sensor para saber qué haces ahora.
const MOTION_LOOKBACK_MS = 12 * 3_600_000;

// Quieto o a pie según el sensor: no se empieza un viaje (el GPS de dentro de
// casa da velocidades falsas). Sin sensor no bloquea nada.
setMotionGates({
  blocksStart: (at) => motionBlocksStart(getMotionEvents(at - MOTION_LOOKBACK_MS), at),
  // Solo opina si el sensor tiene historial antes del viaje; si no, no sabe.
  hadVehicle: (from, to) => {
    const events = getMotionEvents(from - MOTION_LOOKBACK_MS);
    if (!events.some((event) => event.at < from)) return null;
    if (motionActivityAt(events, from) === 'vehicle') return true;
    return events.some(
      (event) =>
        event.type === 'vehicle' && event.transition === 'enter' && event.at >= from && event.at <= to,
    );
  },
});

// Conecta el GPS con la grabación de rutas: fusiona los puntos grabados en
// segundo plano y publica los récords de cada viaje terminado.
export function useTripRecorder(
  location: {
    latitude: number;
    longitude: number;
    speedKmh?: number | null;
    accuracy?: number | null;
  },
  vehicleName?: string,
  // test: viaje del simulador (no cuenta en totales ni récords).
  options?: { walking?: boolean; test?: boolean },
) {
  const hydrate = useTrips((state) => state.hydrate);
  const ingestBackground = useTrips((state) => state.ingestBackground);
  const recordPoint = useTrips((state) => state.recordPoint);
  const stopTrip = useTrips((state) => state.stopTrip);
  const active = useTrips((state) => state.active);
  const hydrated = useTrips((state) => state.hydrated);
  const walking = options?.walking ?? false;
  const test = options?.test ?? false;
  const trackingEnabled = useSession((state) => state.trackingEnabled);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;
    const ingest = () => void ingestBackground();
    const subscription = AppState.addEventListener('change', (state) => {
      // Al salir, los puntos llegan por el servicio de fondo; al volver se
      // recogen antes de aceptar de nuevo el GPS en vivo.
      if (state === 'active') {
        ingest();
        useTrips.getState().closeIfIdle();
      } else useTrips.getState().blockLive();
    });
    const timer = setInterval(ingest, INGEST_EVERY_MS);
    // Sin posiciones nuevas también hay que poder cerrar el viaje.
    const idleTimer = setInterval(() => useTrips.getState().closeIfIdle(), IDLE_CHECK_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
      clearInterval(idleTimer);
    };
  }, [hydrated, ingestBackground]);

  const { latitude, longitude, speedKmh = null, accuracy = null } = location;
  useEffect(() => {
    // Caminando o con tracking automático desactivado no se graba ruta de coche.
    if (walking || !trackingEnabled) return;
    recordPoint({ latitude, longitude, speedKmh, test, accuracy });
  }, [latitude, longitude, speedKmh, accuracy, recordPoint, trackingEnabled, walking, test]);

  // Al empezar a caminar (coche aparcado) se cierra el viaje de coche.
  useEffect(() => {
    if (trackingEnabled && !walking) return;
    if (useTrips.getState().active) void stopTrip();
  }, [trackingEnabled, walking, stopTrip]);

  return { active };
}
