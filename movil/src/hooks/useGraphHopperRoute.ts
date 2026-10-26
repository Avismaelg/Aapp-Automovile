import { useEffect, useRef, useState } from 'react';

import {
  fallbackRoute,
  fetchGraphHopperRoute,
  isGraphHopperConfigured,
} from '@/src/lib/graphhopper';
import type { WorldMapRoute } from '@/src/lib/map-html';

type GeoPoint = {
  latitude: number;
  longitude: number;
};

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

export function useGraphHopperRoute({
  origin,
  destination,
  enabled = true,
}: {
  origin: GeoPoint;
  destination: GeoPoint;
  enabled?: boolean;
}) {
  const [route, setRoute] = useState<WorldMapRoute | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequest = useRef<{
    origin: GeoPoint;
    destination: GeoPoint;
    at: number;
  } | null>(null);

  const originLatitude = origin.latitude;
  const originLongitude = origin.longitude;
  const destinationLatitude = destination.latitude;
  const destinationLongitude = destination.longitude;

  useEffect(() => {
    if (!enabled) return;

    const currentOrigin = {
      latitude: originLatitude,
      longitude: originLongitude,
    };
    const currentDestination = {
      latitude: destinationLatitude,
      longitude: destinationLongitude,
    };

    const previous = lastRequest.current;
    const sameDestination =
      previous &&
      Math.abs(previous.destination.latitude - currentDestination.latitude) < 0.00001 &&
      Math.abs(previous.destination.longitude - currentDestination.longitude) < 0.00001;
    const moved = previous
      ? distanceMeters(previous.origin, currentOrigin)
      : Number.POSITIVE_INFINITY;
    const elapsed = previous ? new Date().getTime() - previous.at : Number.POSITIVE_INFINITY;

    if (sameDestination && moved < 250 && elapsed < 120_000) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const nextRoute = await fetchGraphHopperRoute({
          origin: currentOrigin,
          destination: currentDestination,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRoute(nextRoute);
        lastRequest.current = {
          origin: currentOrigin,
          destination: currentDestination,
          at: new Date().getTime(),
        };
      } catch {
        if (controller.signal.aborted) return;
        setRoute(fallbackRoute(currentOrigin, currentDestination));
        setError('GraphHopper no respondió; mostrando ruta directa.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 700);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destinationLatitude, destinationLongitude, enabled, originLatitude, originLongitude]);

  return {
    route,
    isLoading,
    error,
    configured: isGraphHopperConfigured,
    source: route?.source ?? 'fallback',
  };
}
