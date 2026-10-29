import { useEffect } from 'react';
import { create } from 'zustand';

import {
  fetchStreetRoutes,
  isGraphHopperConfigured,
} from '@/src/lib/graphhopper';
import type { WorldMapRoute } from '@/src/lib/map-html';

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
};

// Compartida entre el mapa y la party: una sola petición a GraphHopper por cambio.
const useRouteState = create<RouteState>(() => ({
  routes: [],
  selected: 0,
  isLoading: false,
  error: null,
}));

let requested: { origin: GeoPoint; destination: GeoPoint; at: number } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingController: AbortController | null = null;

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

function cancelPending() {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  pendingController?.abort();
  pendingController = null;
}

function requestRoute(origin: GeoPoint, destination: GeoPoint) {
  const previous = requested;
  const unchanged =
    previous !== null &&
    samePoint(previous.destination, destination) &&
    distanceMeters(previous.origin, origin) < 250 &&
    Date.now() - previous.at < 120_000;
  if (unchanged) return;

  cancelPending();
  requested = { origin, destination, at: Date.now() };

  const controller = new AbortController();
  pendingController = controller;
  pendingTimer = setTimeout(async () => {
    pendingTimer = null;
    useRouteState.setState({ isLoading: true, error: null });

    try {
      const routes = await fetchStreetRoutes({
        origin,
        destination,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      // Al recalcular se vuelve a la más rápida desde la posición actual.
      useRouteState.setState({
        routes,
        selected: 0,
        isLoading: false,
        error: null,
      });
    } catch {
      if (controller.signal.aborted) return;
      useRouteState.setState({
        routes: [],
        selected: 0,
        isLoading: false,
        error: 'No encontramos una calle transitable entre esos puntos. Elige otro destino o inténtalo de nuevo.',
      });
    }
  }, 700);
}

function clearRoute() {
  cancelPending();
  requested = null;
  useRouteState.setState({ routes: [], selected: 0, isLoading: false, error: null });
}

function selectRoute(index: number) {
  const { routes } = useRouteState.getState();
  if (index >= 0 && index < routes.length) useRouteState.setState({ selected: index });
}

function retryRoute() {
  if (!requested) return;
  const { origin, destination } = requested;
  cancelPending();
  requested = null;
  requestRoute(origin, destination);
}

export function useGraphHopperRoute({
  origin,
  destination,
  enabled = true,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  enabled?: boolean;
}) {
  const originLatitude = origin.latitude;
  const originLongitude = origin.longitude;
  const destinationLatitude = destination.latitude;
  const destinationLongitude = destination.longitude;
  const { routes, selected, isLoading, error } = useRouteState();
  const route = routes[selected] ?? null;

  useEffect(() => {
    if (!enabled) {
      clearRoute();
      return;
    }

    requestRoute(
      { latitude: originLatitude, longitude: originLongitude },
      { latitude: destinationLatitude, longitude: destinationLongitude },
    );
  }, [destinationLatitude, destinationLongitude, enabled, originLatitude, originLongitude]);

  return {
    route,
    routes,
    selected,
    select: selectRoute,
    isLoading,
    error,
    configured: isGraphHopperConfigured,
    source: route?.source ?? 'fallback',
    retry: retryRoute,
  };
}
