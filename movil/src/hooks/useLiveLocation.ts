import * as Location from 'expo-location';
import { useEffect } from 'react';
import { create } from 'zustand';

import { isSimulating, useSimulator } from '@/src/lib/simulator';

export type LiveLocation = {
  latitude: number;
  longitude: number;
  heading: number | null;
  accuracy: number | null;
  speedKmh: number | null;
  source: 'gps' | 'demo' | 'sim';
};

export type LiveLocationStatus = 'locating' | 'live' | 'demo' | 'denied' | 'error';

export const DEMO_LOCATION: LiveLocation = {
  latitude: 18.4861,
  longitude: -69.9312,
  heading: null,
  accuracy: null,
  speedKmh: null,
  source: 'demo',
};

const LOCATING_MESSAGE = 'Solicitando permiso de ubicación…';

type LiveLocationState = {
  status: LiveLocationStatus;
  location: LiveLocation;
  message: string;
};

const useLiveLocationState = create<LiveLocationState>(() => ({
  status: 'locating',
  location: DEMO_LOCATION,
  message: LOCATING_MESSAGE,
}));

// Mientras hay simulación, su posición sustituye a la del GPS; al pararla se
// pide una posición real nueva.
useSimulator.subscribe((state, previous) => {
  if (state.active && state.fix && state.fix !== previous.fix) {
    useLiveLocationState.setState({
      status: 'live',
      message: 'Simulación',
      location: {
        latitude: state.fix.latitude,
        longitude: state.fix.longitude,
        heading: state.fix.heading,
        accuracy: 5,
        speedKmh: state.fix.speedKmh,
        source: 'sim',
      },
    });
  } else if (!state.active && previous.active) {
    retryLiveLocation();
  }
});

// Una sola suscripción GPS para el mapa y la party; se cierra cuando nadie la usa.
let subscribers = 0;
let session = 0;
let activeWatch: Location.LocationSubscription | null = null;
let activeHeading: Location.LocationSubscription | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
let lastFixAt = 0;
let sessionStartedAt = 0;
let lastHeadingAt = 0;

function validHeading(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function validSpeedKmh(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value * 3.6 : null;
}

function clearFallbackTimer() {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
}

function applyPosition(position: Location.LocationObject) {
  if (isSimulating()) return;
  clearFallbackTimer();
  lastFixAt = Date.now();
  const speedKmh = validSpeedKmh(position.coords.speed);
  const previousHeading = useLiveLocationState.getState().location.heading;
  const gpsHeading = validHeading(position.coords.heading);
  // Parado o a poca velocidad se conserva el rumbo de la brújula.
  const heading =
    gpsHeading ?? (speedKmh == null || speedKmh < 10 ? previousHeading : null);
  useLiveLocationState.setState({
    status: 'live',
    message: 'Ubicación en vivo',
    location: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading,
      accuracy: position.coords.accuracy ?? null,
      speedKmh,
      source: 'gps',
    },
  });
}

// La brújula da el rumbo real del teléfono cuando vamos despacio o parados;
// en marcha manda el rumbo del GPS.
function applyCompassHeading(value: number) {
  if (isSimulating()) return;
  if (!Number.isFinite(value) || value < 0) return;
  const current = useLiveLocationState.getState();
  const speed = current.location.speedKmh ?? 0;
  if (speed >= 10) return;

  const previous = current.location.heading;
  if (previous != null) {
    const delta = Math.abs(((value - previous + 540) % 360) - 180);
    if (delta < 8) return;
  }

  const now = Date.now();
    if (now - lastHeadingAt < 1_400) return;
  lastHeadingAt = now;
  useLiveLocationState.setState({
    location: { ...current.location, heading: value },
  });
}

function fallBackToDemo(status: 'denied' | 'error', message: string) {
  clearFallbackTimer();
  useLiveLocationState.setState({ status, message, location: DEMO_LOCATION });
}

function handleWatchError(id: number) {
  if (id !== session) return;
  if (useLiveLocationState.getState().location.source === 'gps') {
    useLiveLocationState.setState({
      status: 'error',
      message: 'Señal GPS perdida · mostrando la última posición',
    });
    return;
  }
  fallBackToDemo('error', 'No pudimos leer el GPS · usando ubicación de demo');
}

async function beginSession(id: number) {
  try {
    // Pedir el permiso abre (y cierra) una pantalla del sistema aunque ya esté
    // concedido; eso pausa la app y dispara AppState. Solo se pide si falta.
    const current = await Location.getForegroundPermissionsAsync();
    const permission = current.granted ? current : await Location.requestForegroundPermissionsAsync();
    if (id !== session) return;

    if (permission.status !== 'granted') {
      fallBackToDemo('denied', 'Permiso de ubicación denegado · usando ubicación de demo');
      return;
    }

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
      requiredAccuracy: 250,
    });
    if (id !== session) return;
    if (lastKnown) {
      applyPosition(lastKnown);
    } else if (useLiveLocationState.getState().status !== 'live') {
      useLiveLocationState.setState({ message: 'Conectando con el GPS…' });
    }

    const subscription = await Location.watchPositionAsync(
      {
        // Una señal por segundo mientras el mapa está abierto: el mapa anima
        // entre señales, pero con 2,5 s el coche iba siempre por detrás.
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1_000,
        distanceInterval: 1,
      },
      (position) => {
        if (id === session) applyPosition(position);
      },
      () => handleWatchError(id),
    );

    if (id !== session) {
      subscription.remove();
      return;
    }
    activeWatch = subscription;

    // Brújula: permite girar el mapa aunque estemos parados o caminando.
    try {
      const heading = await Location.watchHeadingAsync(
        (update) => {
          if (id !== session) return;
          const value = update.trueHeading >= 0 ? update.trueHeading : update.magHeading;
          applyCompassHeading(value);
        },
        () => {
          // Sin brújula en este dispositivo: seguimos con el rumbo del GPS.
        },
      );
      if (id !== session) {
        heading.remove();
        return;
      }
      activeHeading = heading;
    } catch {
      // La brújula es opcional.
    }
  } catch {
    if (id !== session) return;
    fallBackToDemo('error', 'GPS no disponible · usando ubicación de demo');
  }
}

function startSession(message?: string) {
  session += 1;
  const id = session;
  sessionStartedAt = Date.now();
  clearFallbackTimer();
  useLiveLocationState.setState({ status: 'locating', message: message || LOCATING_MESSAGE });

  // No bloquear la pantalla si el permiso o el GPS tardan en responder.
  fallbackTimer = setTimeout(() => {
    if (id !== session) return;
    if (useLiveLocationState.getState().status !== 'locating') return;
    useLiveLocationState.setState({
      status: 'demo',
      message: 'Ubicación aproximada · esperando permiso o señal GPS',
    });
  }, 8_000);

  void beginSession(id);
}

function stopSession() {
  session += 1;
  clearFallbackTimer();
  activeWatch?.remove();
  activeWatch = null;
  activeHeading?.remove();
  activeHeading = null;
}

function acquireLocation() {
  subscribers += 1;
  if (subscribers === 1) startSession();
}

function releaseLocation() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers === 0) stopSession();
}

export function retryLiveLocation() {
  if (subscribers === 0) return;
  stopSession();
  startSession();
}

// Al volver a primer plano Android puede haber pausado el GPS: si la última
// posición es vieja (o nunca llegó), se reinicia la sesión para obtener una
// posición fresca en lugar de seguir mostrando la anterior.
export function refreshStaleLocation(maxAgeMs = 20_000) {
  if (subscribers === 0) return;
  // Una sesión recién arrancada aún no ha tenido tiempo de dar posición:
  // reiniciarla otra vez entraría en bucle (cada reinicio pausa la app).
  if (Date.now() - sessionStartedAt < 15_000) return;
  const noFixForAWhile = lastFixAt === 0 && Date.now() - sessionStartedAt > 15_000;
  const staleFix = lastFixAt > 0 && Date.now() - lastFixAt > maxAgeMs;
  if (!noFixForAWhile && !staleFix) return;
  stopSession();
  startSession('Actualizando tu ubicación…');
}

export function useLiveLocation() {
  useEffect(() => {
    acquireLocation();
    return releaseLocation;
  }, []);

  const status = useLiveLocationState((state) => state.status);
  const location = useLiveLocationState((state) => state.location);
  const message = useLiveLocationState((state) => state.message);

  return {
    status,
    location,
    message,
    retry: retryLiveLocation,
    isLive: status === 'live',
  };
}
