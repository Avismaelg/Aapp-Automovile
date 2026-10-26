import * as Location from 'expo-location';
import { useEffect } from 'react';
import { create } from 'zustand';

export type LiveLocation = {
  latitude: number;
  longitude: number;
  heading: number | null;
  accuracy: number | null;
  speedKmh: number | null;
  source: 'gps' | 'demo';
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

// Una sola suscripción GPS para el mapa y la party; se cierra cuando nadie la usa.
let subscribers = 0;
let session = 0;
let activeWatch: Location.LocationSubscription | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

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
  clearFallbackTimer();
  useLiveLocationState.setState({
    status: 'live',
    message: 'Ubicación en vivo',
    location: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      heading: validHeading(position.coords.heading),
      accuracy: position.coords.accuracy ?? null,
      speedKmh: validSpeedKmh(position.coords.speed),
      source: 'gps',
    },
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
    const permission = await Location.requestForegroundPermissionsAsync();
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
        accuracy: Location.Accuracy.High,
        timeInterval: 2_000,
        distanceInterval: 3,
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
  } catch {
    if (id !== session) return;
    fallBackToDemo('error', 'GPS no disponible · usando ubicación de demo');
  }
}

function startSession() {
  session += 1;
  const id = session;
  clearFallbackTimer();
  useLiveLocationState.setState({ status: 'locating', message: LOCATING_MESSAGE });

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
