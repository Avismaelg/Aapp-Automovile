import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { useGraphHopperRoute } from '@/src/hooks/useGraphHopperRoute';
import type { LiveLocation } from '@/src/hooks/useLiveLocation';
import { useStoppedFor } from '@/src/hooks/useStoppedFor';
import { speechLanguage, t } from '@/src/i18n';
import { ARRIVE_STOPPED_MS, arrivedAtDestination } from '@/src/lib/arrival';
import { haversineMeters } from '@/src/lib/geo';
import { fetchStreetRoutes } from '@/src/lib/graphhopper';
import { fasterRouteSaving } from '@/src/lib/route-geometry';
import { cumulativeDistances, routeProgress, snappedPosition } from '@/src/lib/route-instructions';
import { reachedNextStop } from '@/src/lib/stops';
import { useChosenDestination, type ChosenDestination, type RouteStop } from '@/src/store/destination';

// MAPA-12: cada cuánto se busca una ruta más rápida navegando.
const FASTER_ROUTE_EVERY_MS = 3 * 60_000;

// MAPA-16: desvío y recálculo automático.
const OFF_ROUTE_M = 40;
const OFF_ROUTE_HOLD_MS = 5_000;
const REROUTE_EVERY_MS = 8_000;

type RouteState = ReturnType<typeof useGraphHopperRoute>;

// La navegación en curso sobre la ruta elegida: avance, coche pegado a la
// calle, desvío y recálculo, paradas alcanzadas, llegada y búsqueda periódica
// de una ruta más rápida. Sale de la pantalla del mapa (app/(tabs)/index.tsx)
// tal cual estaba; la pantalla solo pinta lo que devuelve.
export function useActiveNavigation({
  route,
  location,
  destination,
  isNavigating,
  stops,
  voiceMuted,
}: {
  route: RouteState;
  location: LiveLocation;
  destination: ChosenDestination | null;
  isNavigating: boolean;
  stops: RouteStop[];
  voiceMuted: boolean;
}) {
  const navigating = isNavigating && Boolean(destination);
  const streetRoute = route.route?.source === 'fallback' ? null : route.route;
  const removeStop = useChosenDestination((state) => state.removeStop);
  const clearChosenDestination = useChosenDestination((state) => state.clearDestination);
  const retryRoute = route.retry;

  // Progreso sobre la ruta y próxima maniobra, como Waze. Se recalcula solo
  // cuando cambia la posición, no en cada actualización de rumbo.
  const latitude = location.latitude;
  const longitude = location.longitude;
  const routeCumulative = useMemo(
    () => (route.route ? cumulativeDistances(route.route.coordinates) : []),
    [route.route],
  );
  const progressState = useMemo(
    () =>
      route.route
        ? routeProgress(route.route.coordinates, routeCumulative, {
            latitude,
            longitude,
          })
        : null,
    [route.route, routeCumulative, latitude, longitude],
  );
  const progressM = progressState?.progressM ?? null;
  const routeDistanceFromPathM = progressState?.distanceM ?? null;
  // MAPA-06: navegando, el coche va pegado a la calle de la ruta. Solo para
  // dibujar: avance, fuera de ruta y llegada usan tu posición real.
  const snapped =
    isNavigating && destination && streetRoute ? snappedPosition(location, progressState) : null;
  const snappedLat = snapped?.latitude ?? null;
  const snappedLng = snapped?.longitude ?? null;
  const mapLocation = useMemo(
    () =>
      snappedLat != null && snappedLng != null
        ? { ...location, latitude: snappedLat, longitude: snappedLng }
        : location,
    [location, snappedLat, snappedLng],
  );
  // MAPA-16: fuera de la ruta = a más de 40 m durante 5 s (un salto suelto
  // del GPS no cuenta).
  const awayFromRoute = Boolean(
    route.route && routeDistanceFromPathM != null && routeDistanceFromPathM > OFF_ROUTE_M,
  );
  const [offRouteHeld, setOffRouteHeld] = useState(false);
  useEffect(() => {
    if (!awayFromRoute) return;
    const timer = setTimeout(() => setOffRouteHeld(true), OFF_ROUTE_HOLD_MS);
    return () => {
      clearTimeout(timer);
      setOffRouteHeld(false);
    };
  }, [awayFromRoute]);
  const offRoute = awayFromRoute && offRouteHeld;
  const remainingRouteM =
    route.route && progressM != null ? Math.max(0, route.route.distanceM - progressM) : null;
  const remainingTimeMs =
    route.route && remainingRouteM != null && route.route.distanceM > 0
      ? route.route.timeMs * (remainingRouteM / route.route.distanceM)
      : null;

  // Parada alcanzada: se quita de la lista y la ruta sigue a la próxima.
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  // Distancia de la próxima parada a la ruta (la ruta pasa por la calle más
  // cercana, no por la parada exacta).
  const nextStopOffRoadM = useMemo(() => {
    const next = stops[0];
    if (!next || !route.route || routeCumulative.length < 2) return 0;
    return routeProgress(route.route.coordinates, routeCumulative, next)?.distanceM ?? 0;
  }, [stops, route.route, routeCumulative]);
  const atNextStop = navigating && reachedNextStop(location, stops, nextStopOffRoadM);
  useEffect(() => {
    if (!atNextStop) return;
    const label = useChosenDestination.getState().stops[0]?.label;
    const timer = setTimeout(() => {
      removeStop(0);
      if (!label) return;
      setStopNotice(label);
      if (!voiceMuted) Speech.speak(t('Parada: {0}', label), { language: speechLanguage() });
    }, 0);
    return () => clearTimeout(timer);
  }, [atNextStop, removeStop, voiceMuted]);
  useEffect(() => {
    if (!stopNotice) return;
    const timer = setTimeout(() => setStopNotice(null), 6_000);
    return () => clearTimeout(timer);
  }, [stopNotice]);

  // Llegada: se termina la navegación sola y se avisa, como Waze. Antes solo
  // contaba a menos de 40 m del punto exacto: aparcando a 60–100 m (un
  // parqueo, el otro lado de la calle) nunca decía «Has llegado» (tableta,
  // 2026-11-04). Ver arrivedAtDestination.
  const [arrivedLabel, setArrivedLabel] = useState<string | null>(null);
  // El aviso de voz sale 600 ms después de terminar la ruta: si la pantalla se
  // desmonta antes (cerrar sesión), no debe hablar.
  const arrivalSpeechRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (arrivalSpeechRef.current) clearTimeout(arrivalSpeechRef.current);
    },
    [],
  );
  const destinationDistanceM = destination ? haversineMeters(location, destination) : null;
  const stoppedNear = useStoppedFor(location.speedKmh, ARRIVE_STOPPED_MS);
  const arrived =
    navigating &&
    destination != null &&
    arrivedAtDestination({
      distanceM: destinationDistanceM,
      remainingRouteM,
      offRouteM: routeDistanceFromPathM,
      stopped: stoppedNear,
    });
  useEffect(() => {
    if (!arrived || !destination) return;
    const label = destination.label;
    // Fuera del cuerpo del efecto: terminar la ruta re-renderiza la pantalla.
    const timer = setTimeout(() => {
      setArrivedLabel(label);
      useChosenDestination.getState().stopNavigation();
      clearChosenDestination();
      // La guía por voz se calla al terminar la ruta: el aviso va después.
      if (!voiceMuted) {
        if (arrivalSpeechRef.current) clearTimeout(arrivalSpeechRef.current);
        arrivalSpeechRef.current = setTimeout(() => {
          arrivalSpeechRef.current = null;
          Speech.speak(t('Has llegado a {0}', label), { language: speechLanguage() });
        }, 600);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [arrived, destination, voiceMuted, clearChosenDestination]);
  useEffect(() => {
    if (!arrivedLabel) return;
    const timer = setTimeout(() => setArrivedLabel(null), 8_000);
    return () => clearTimeout(timer);
  }, [arrivedLabel]);

  // MAPA-12 (como Waze): navegando, cada 3 min se busca una ruta más rápida
  // por el tráfico desde donde estás. Si ahorra de verdad (2 min y un 8 %),
  // se cambia sola y se avisa por voz.
  const fasterCheckRef = useRef({ remainingS: 0, origin: location, destination, stops });
  useEffect(() => {
    fasterCheckRef.current = {
      remainingS: (remainingTimeMs ?? 0) / 1000,
      origin: location,
      destination,
      stops,
    };
  }, [remainingTimeMs, location, destination, stops]);
  const adoptRoutes = route.adopt;
  useEffect(() => {
    if (!navigating) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setInterval(() => {
      const { remainingS, origin, destination: goal, stops: waypoints } = fasterCheckRef.current;
      if (!goal || remainingS < 300) return;
      void fetchStreetRoutes({ origin, destination: goal, stops: waypoints, signal: controller.signal })
        .then((candidates) => {
          const best = candidates[0];
          if (cancelled || !best || best.source === 'fallback') return;
          const saving = fasterRouteSaving(remainingS, best.timeMs / 1000);
          if (saving == null) return;
          adoptRoutes(candidates);
          if (!voiceMuted) {
            Speech.speak(t('Encontré una ruta más rápida: ahorras {0} minutos.', Math.round(saving / 60)), {
              language: speechLanguage(),
            });
          }
        })
        .catch(() => undefined);
    }, FASTER_ROUTE_EVERY_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [navigating, adoptRoutes, voiceMuted]);

  // Desviado: se recalcula desde donde estás (como mucho cada 8 s).
  const lastRerouteAtRef = useRef(0);
  useEffect(() => {
    if (!navigating || !offRoute || route.isLoading) return;
    const now = Date.now();
    if (now - lastRerouteAtRef.current < REROUTE_EVERY_MS) return;
    lastRerouteAtRef.current = now;
    retryRoute();
  }, [navigating, offRoute, retryRoute, route.isLoading]);

  return {
    progressState,
    progressM,
    mapLocation,
    offRoute,
    remainingRouteM,
    remainingTimeMs,
    stopNotice,
    arrivedLabel,
    dismissArrived: () => setArrivedLabel(null),
  };
}
