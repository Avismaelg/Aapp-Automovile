import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { backgroundLocationAction } from '@/src/lib/background-location';
import { isSimulating, useSimulator } from '@/src/lib/simulator';
import { askLocationConsent } from '@/src/lib/location-consent';
import { nextSpeed, type SpeedState } from '@/src/lib/speed-filter';
import { setUnitsFromPosition, t } from '@/src/i18n';
import { useChosenDestination } from '@/src/store/destination';

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

const LOCATING_MESSAGE = t('Solicitando permiso de ubicación…');

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
      message: t('Simulación'),
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

function clearFallbackTimer() {
  if (fallbackTimer) clearTimeout(fallbackTimer);
  fallbackTimer = null;
}

// Velocímetro filtrado (ver src/lib/speed-filter.ts).
let speedState: SpeedState | null = null;

function applyPosition(position: Location.LocationObject) {
  if (isSimulating()) return;
  clearFallbackTimer();
  lastFixAt = Date.now();
  speedState = nextSpeed(speedState, {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    speedMps: position.coords.speed,
    accuracyM: position.coords.accuracy,
    at: position.timestamp || Date.now(),
  });
  const speedKmh = speedState.speedKmh;
  const previousHeading = useLiveLocationState.getState().location.heading;
  const gpsHeading = validHeading(position.coords.heading);
  // Parado o a poca velocidad se conserva el rumbo de la brújula.
  const heading =
    gpsHeading ?? (speedKmh == null || speedKmh < 10 ? previousHeading : null);
  setUnitsFromPosition(position.coords.latitude, position.coords.longitude);
  useLiveLocationState.setState({
    status: 'live',
    message: t('Ubicación en vivo'),
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
  // En simulación manda la posición simulada, aunque el GPS real falle.
  if (isSimulating()) return;
  clearFallbackTimer();
  useLiveLocationState.setState({ status, message, location: DEMO_LOCATION });
}

function handleWatchError(id: number) {
  if (id !== session || isSimulating()) return;
  if (useLiveLocationState.getState().location.source === 'gps') {
    useLiveLocationState.setState({
      status: 'error',
      message: t('Señal GPS perdida · mostrando la última posición'),
    });
    return;
  }
  fallBackToDemo('error', t('No pudimos leer el GPS · usando ubicación de demo'));
}

// Brújula: permite girar el mapa aunque estemos parados o caminando.
async function watchCompass(id: number) {
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
    // Si la app se fue a segundo plano mientras se abría la brújula, no se
    // deja encendida: al volver, resumeFromBackground la abre otra vez.
    if (id !== session || AppState.currentState === 'background') {
      heading.remove();
      return;
    }
    activeHeading = heading;
  } catch {
    // La brújula es opcional.
  }
}

async function beginSession(id: number) {
  try {
    // Pedir el permiso abre (y cierra) una pantalla del sistema aunque ya esté
    // concedido; eso pausa la app y dispara AppState. Solo se pide si falta.
    const current = await Location.getForegroundPermissionsAsync();
    if (id !== session) return;
    if (AppState.currentState === 'background' && !useChosenDestination.getState().isNavigating) {
      pausedInBackground = true;
      return;
    }
    // OTR-01: antes del aviso del sistema, la app explica el uso y pide el
    // consentimiento; sin él se usa la posición de demostración.
    if (!current.granted && !(await askLocationConsent())) {
      if (id === session) fallBackToDemo('denied', t('Sin permiso de ubicación · usando ubicación de demo'));
      return;
    }
    if (id !== session) return;
    if (AppState.currentState === 'background' && !useChosenDestination.getState().isNavigating) {
      pausedInBackground = true;
      return;
    }
    const permission = current.granted ? current : await Location.requestForegroundPermissionsAsync();
    if (id !== session) return;

    if (permission.status !== 'granted') {
      fallBackToDemo('denied', t('Permiso de ubicación denegado · usando ubicación de demo'));
      return;
    }
    // B8: si la app se fue a segundo plano mientras se pedía el permiso, no se
    // sigue arrancando el GPS sin navegación. Al volver, resumeFromBackground
    // inicia una sesión limpia.
    if (AppState.currentState === 'background' && !useChosenDestination.getState().isNavigating) {
      pausedInBackground = true;
      return;
    }

    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
      requiredAccuracy: 250,
    });
    if (id !== session) return;
    if (AppState.currentState === 'background' && !useChosenDestination.getState().isNavigating) {
      pausedInBackground = true;
      return;
    }
    if (lastKnown) {
      applyPosition(lastKnown);
    } else if (useLiveLocationState.getState().status !== 'live') {
      useLiveLocationState.setState({ message: t('Conectando con el GPS…') });
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
    // B8: la app pudo irse a segundo plano mientras se pedía el permiso o se
    // abría el GPS. Sin navegación se corta esta sesión recién nacida; navegando
    // se conserva el GPS pero no se enciende la brújula, que solo sirve en
    // pantalla. Al volver, resumeFromBackground la enciende.
    if (AppState.currentState === 'background') {
      if (!useChosenDestination.getState().isNavigating) {
        stopSession();
        pausedInBackground = true;
        return;
      }
      pausedInBackground = true;
      return;
    }
    await watchCompass(id);
  } catch {
    if (id !== session) return;
    fallBackToDemo('error', t('GPS no disponible · usando ubicación de demo'));
  }
}

// quiet: al volver de segundo plano no se muestra «Solicitando permiso…»; se
// sigue viendo la última posición hasta que llega la nueva.
function startSession(message?: string, quiet = false) {
  session += 1;
  const id = session;
  sessionStartedAt = Date.now();
  pausedInBackground = false;
  clearFallbackTimer();
  if (!quiet && !isSimulating()) {
    useLiveLocationState.setState({ status: 'locating', message: message || LOCATING_MESSAGE });
  }

  // No bloquear la pantalla si el permiso o el GPS tardan en responder.
  fallbackTimer = setTimeout(() => {
    if (id !== session || isSimulating()) return;
    if (useLiveLocationState.getState().status !== 'locating') return;
    useLiveLocationState.setState({
      status: 'demo',
      message: t('Ubicación aproximada · esperando permiso o señal GPS'),
    });
  }, 8_000);

  void beginSession(id);
}

function stopSession() {
  session += 1;
  pausedInBackground = false;
  clearFallbackTimer();
  activeWatch?.remove();
  activeWatch = null;
  activeHeading?.remove();
  activeHeading = null;
}

// Con la app en segundo plano el GPS a 1 Hz y la brújula no los ve nadie (las
// posiciones de fondo llegan por la tarea de tracking.ts): se apagan y se
// encienden al volver. Navegando, el GPS sigue (la voz da las indicaciones
// con la pantalla bloqueada); la brújula no, que solo sirve en pantalla.
let pausedInBackground = false;

function pauseForBackground() {
  const action = backgroundLocationAction({
    subscribers,
    navigating: useChosenDestination.getState().isNavigating,
    hasHandles: Boolean(activeWatch || activeHeading),
    denied: useLiveLocationState.getState().status === 'denied',
  });
  if (action === 'none') return;
  if (action === 'keep-gps') {
    activeHeading?.remove();
    activeHeading = null;
  } else if (action === 'stop') {
    stopSession();
  }
  // En 'pause' no se corta aquí: beginSession comprueba el fondo tras cada
  // espera y no llega a abrir el GPS sin navegación. Antes se dejaba seguir.
  pausedInBackground = true;
}

function resumeFromBackground() {
  if (!pausedInBackground) return;
  pausedInBackground = false;
  if (subscribers === 0) return;
  if (activeWatch) {
    if (!activeHeading) void watchCompass(session);
  } else if (useLiveLocationState.getState().status !== 'denied') {
    // Con el permiso denegado no se reintenta solo al volver: el usuario puede
    // concederlo desde Ajustes y usar «reintentar», pero no se le pregunta en
    // cada cambio de pantalla.
    startSession(undefined, true);
  }
}

// Solo «background»: «inactive» (iOS) salta también con el aviso de permisos
// o al bajar el centro de control, y cortar ahí reiniciaría el GPS sin motivo.
AppState.addEventListener('change', (state) => {
  if (state === 'background') pauseForBackground();
  else if (state === 'active') resumeFromBackground();
});

// Si la ruta termina con la app en segundo plano, el GPS ya no hace falta.
useChosenDestination.subscribe((state, previous) => {
  if (previous.isNavigating && !state.isNavigating && AppState.currentState === 'background' && activeWatch) {
    stopSession();
    pausedInBackground = true;
  }
});

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
  // En simulación el GPS real se ignora: no hay nada que refrescar.
  if (subscribers === 0 || isSimulating()) return;
  // Volviendo de segundo plano manda la reanudación (silenciosa); reiniciar
  // aquí además arrancaba el GPS dos veces y enseñaba «Actualizando…».
  if (pausedInBackground) {
    resumeFromBackground();
    return;
  }
  // Una sesión recién arrancada aún no ha tenido tiempo de dar posición:
  // reiniciarla otra vez entraría en bucle (cada reinicio pausa la app).
  if (Date.now() - sessionStartedAt < 15_000) return;
  // Pasados esos 15 s, sin ninguna posición o con una vieja se reinicia.
  if (lastFixAt > 0 && Date.now() - lastFixAt <= maxAgeMs) return;
  // Con posición en vivo se refresca sin pasar por «localizando»: ese paso
  // cortaba un momento lo que depende de isLive (compartir posición, retos).
  const wasLive = useLiveLocationState.getState().status === 'live';
  stopSession();
  startSession(t('Actualizando tu ubicación…'), wasLive);
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
