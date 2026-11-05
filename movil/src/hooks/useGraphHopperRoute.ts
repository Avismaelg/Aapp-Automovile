import { useEffect } from 'react';
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import {
  fetchStreetRoutes,
  isGraphHopperConfigured,
} from '@/src/lib/graphhopper';
import type { WorldMapRoute } from '@/src/lib/map-html';
import { t } from '@/src/i18n';

type GeoPoint = {
  latitude: number;
  longitude: number;
};

type RouteState = {
  // Opciones de la más rápida a la más lenta; selected es la elegida.
  routes: WorldMapRoute[];
  selected: number;
  isLoading: boolean;
  error: string | null;
  // MAPA-28: el recálculo falló (sin conexión) y se sigue con la ruta que ya
  // había hacia el mismo destino.
  keptOffline: boolean;
};

// MAPA-28: ¿se puede seguir con la ruta que ya hay? Solo si es por calles y va
// al mismo destino (y con las mismas paradas): un destino nuevo sin conexión
// no tiene ruta guardada.
export function keepRouteWhenOffline(
  current: WorldMapRoute[],
  previousDestination: GeoPoint | null,
  destination: GeoPoint,
) {
  const kept = current[0];
  if (!kept || kept.source === 'fallback' || !previousDestination) return false;
  return distanceMeters(previousDestination, destination) < 30;
}

const NO_STOPS: GeoPoint[] = [];

// Si el cálculo se alarga más que esto, se deja de mostrar «Calculando» y se
// puede reintentar (nunca se queda colgado).
const ROUTE_GIVE_UP_MS = 15_000;

function distanceMeters(a: GeoPoint, b: GeoPoint) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function samePoint(a: GeoPoint, b: GeoPoint) {
  return Math.abs(a.latitude - b.latitude) < 0.00001 && Math.abs(a.longitude - b.longitude) < 0.00001;
}

function sameStops(a: GeoPoint[], b: GeoPoint[]) {
  return a.length === b.length && a.every((point, index) => samePoint(point, b[index]));
}

// Fallo de red (sin datos, sin wifi, tiempo agotado), no «no hay calle».
function isNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error instanceof TypeError ||
    error.name === 'AbortError' ||
    /network|failed to fetch|timeout|internet/i.test(error.message)
  );
}

type Channel = {
  store: UseBoundStore<StoreApi<RouteState>>;
  adopt: (routes: WorldMapRoute[]) => void;
  request: (origin: GeoPoint, destination: GeoPoint, stops?: GeoPoint[]) => void;
  clear: () => void;
  select: (index: number) => void;
  retry: () => void;
};

// Cada pantalla calcula su ruta por su cuenta («canal»). Antes Inicio y la
// pestaña del convoy compartían la misma petición: con destinos distintos se
// cancelaban la una a la otra en cada lectura del GPS y la ruta se quedaba
// «Calculando…» sin dejar iniciar la navegación.
// Exportada para las pruebas (desvíos seguidos, sin conexión).
export function createChannel(): Channel {
  const store = create<RouteState>(() => ({
    routes: [],
    selected: 0,
    isLoading: false,
    error: null,
    keptOffline: false,
  }));

  let requested: { origin: GeoPoint; destination: GeoPoint; stops: GeoPoint[]; at: number } | null = null;
  // Última posición conocida: al recalcular (p. ej. por salirte de la ruta) se
  // parte de donde estás ahora, no de donde se pidió la ruta anterior.
  let latestOrigin: GeoPoint | null = null;
  // Destino y paradas de la ruta por calles que se muestra ahora. Se guarda
  // aparte de `requested` porque retry() lo borra antes de pedir de nuevo: al
  // recalcular tras un desvío sin red se perdía la ruta guardada (MAPA-28).
  let shown: { destination: GeoPoint; stops: GeoPoint[] } | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingController: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let giveUpTimer: ReturnType<typeof setTimeout> | null = null;

  const cancelPending = () => {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (giveUpTimer) clearTimeout(giveUpTimer);
    giveUpTimer = null;
    pendingController?.abort();
    pendingController = null;
  };

  const retry = () => {
    if (!requested) return;
    const { destination, stops } = requested;
    const origin = latestOrigin ?? requested.origin;
    cancelPending();
    requested = null;
    request(origin, destination, stops);
  };

  const scheduleRetry = (ms: number) => {
    const pending = requested;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (requested === pending) retry();
    }, ms);
  };

  function request(origin: GeoPoint, destination: GeoPoint, stops: GeoPoint[] = []) {
    latestOrigin = origin;
    const previous = requested;
    const unchanged =
      previous !== null &&
      samePoint(previous.destination, destination) &&
      sameStops(previous.stops, stops) &&
      distanceMeters(previous.origin, origin) < 250 &&
      Date.now() - previous.at < 120_000;
    if (unchanged) return;

    cancelPending();
    // Destino de la ruta que hay ahora (para conservarla si falla la red).
    const keptDestination = shown && sameStops(shown.stops, stops) ? shown.destination : null;
    requested = { origin, destination, stops, at: Date.now() };

    const controller = new AbortController();
    pendingController = controller;
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      store.setState({ isLoading: true, error: null });
      giveUpTimer = setTimeout(() => {
        giveUpTimer = null;
        if (controller.signal.aborted) return;
        controller.abort();
        store.setState({
          isLoading: false,
          error: t('La ruta tarda demasiado. Revisa tu conexión y reintenta.'),
        });
        scheduleRetry(5_000);
      }, ROUTE_GIVE_UP_MS);

      try {
        const routes = await fetchStreetRoutes({
          origin,
          destination,
          stops,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (giveUpTimer) clearTimeout(giveUpTimer);
        giveUpTimer = null;
        // Sin red, la cadena acaba en la línea directa: con una ruta por calles
        // al mismo destino se sigue con ella en vez de perder la guía.
        if (routes[0]?.source === 'fallback' && keepRouteWhenOffline(store.getState().routes, keptDestination, destination)) {
          store.setState({ isLoading: false, error: null, keptOffline: true });
          scheduleRetry(15_000);
          return;
        }
        // Al recalcular se vuelve a la más rápida desde la posición actual.
        store.setState({ routes, selected: 0, isLoading: false, error: null, keptOffline: false });
        shown = routes[0]?.source === 'fallback' ? null : { destination, stops };
        // Línea directa (sin motor de rutas): se sigue intentando la ruta por calles.
        if (routes[0]?.source === 'fallback') scheduleRetry(15_000);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (giveUpTimer) clearTimeout(giveUpTimer);
        giveUpTimer = null;
        const offline = isNetworkError(error);
        if (offline && keepRouteWhenOffline(store.getState().routes, keptDestination, destination)) {
          store.setState({ isLoading: false, error: null, keptOffline: true });
          scheduleRetry(8_000);
          return;
        }
        shown = null;
        store.setState({
          keptOffline: false,
          routes: [],
          selected: 0,
          isLoading: false,
          error: offline
            ? t('Sin conexión: no pudimos calcular la ruta. Reintentando…')
            : t('No encontramos una calle transitable entre esos puntos. Elige otro destino o inténtalo de nuevo.'),
        });
        // Sin conexión se reintenta solo hasta que vuelva la red.
        if (offline) scheduleRetry(8_000);
      }
    }, 700);
  }

  return {
    store,
    // Ruta mejor encontrada en segundo plano (p. ej. por tráfico): se cambia
    // sin volver a pedirla.
    adopt: (routes) => {
      if (routes.length === 0 || !requested) return;
      requested = { ...requested, origin: latestOrigin ?? requested.origin, at: Date.now() };
      store.setState({ routes, selected: 0, isLoading: false, error: null });
    },
    request,
    clear: () => {
      cancelPending();
      requested = null;
      shown = null;
      store.setState({ routes: [], selected: 0, isLoading: false, error: null });
    },
    select: (index) => {
      const { routes } = store.getState();
      if (index >= 0 && index < routes.length) store.setState({ selected: index });
    },
    retry,
  };
}

const channels = new Map<string, Channel>();
function channelFor(name: string) {
  let channel = channels.get(name);
  if (!channel) {
    channel = createChannel();
    channels.set(name, channel);
  }
  return channel;
}

export function useGraphHopperRoute({
  origin,
  destination,
  stops = NO_STOPS,
  enabled = true,
  channel: channelName = 'main',
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  // Paradas en orden, entre la salida y el destino.
  stops?: GeoPoint[];
  enabled?: boolean;
  // Pantalla que pide la ruta: cada una tiene su propio cálculo.
  channel?: string;
}) {
  const channel = channelFor(channelName);
  const originLatitude = origin.latitude;
  const originLongitude = origin.longitude;
  const destinationLatitude = destination.latitude;
  const destinationLongitude = destination.longitude;
  const { routes, selected, isLoading, error, keptOffline } = channel.store();
  // Clave estable para el efecto (las paradas llegan como array nuevo).
  const stopsKey = stops.map((stop) => `${stop.latitude},${stop.longitude}`).join(';');
  const route = routes[selected] ?? null;

  useEffect(() => {
    if (!enabled) {
      channel.clear();
      return;
    }

    const stopPoints = stopsKey
      ? stopsKey.split(';').map((pair) => {
          const [latitude, longitude] = pair.split(',').map(Number);
          return { latitude, longitude };
        })
      : [];
    channel.request(
      { latitude: originLatitude, longitude: originLongitude },
      { latitude: destinationLatitude, longitude: destinationLongitude },
      stopPoints,
    );
  }, [channel, destinationLatitude, destinationLongitude, enabled, originLatitude, originLongitude, stopsKey]);

  return {
    route,
    routes,
    selected,
    select: channel.select,
    isLoading,
    error,
    keptOffline,
    configured: isGraphHopperConfigured,
    source: route?.source ?? 'fallback',
    retry: channel.retry,
    adopt: channel.adopt,
  };
}
