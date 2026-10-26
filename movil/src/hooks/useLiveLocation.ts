import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

export type LiveLocation = {
  latitude: number;
  longitude: number;
  heading: number | null;
  accuracy: number | null;
  source: 'gps' | 'demo';
};

export type LiveLocationStatus = 'locating' | 'live' | 'demo' | 'denied' | 'error';

export const DEMO_LOCATION: LiveLocation = {
  latitude: 18.4861,
  longitude: -69.9312,
  heading: null,
  accuracy: null,
  source: 'demo',
};

export function useLiveLocation() {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<LiveLocationStatus>('locating');
  const [location, setLocation] = useState<LiveLocation>(DEMO_LOCATION);
  const [message, setMessage] = useState('Solicitando permiso de ubicación…');

  const retry = useCallback(() => {
    setStatus('locating');
    setMessage('Solicitando permiso de ubicación…');
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let subscription: Location.LocationSubscription | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const clearFallback = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const applyPosition = (position: Location.LocationObject) => {
      if (!active) return;
      clearFallback();
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        heading: position.coords.heading ?? null,
        accuracy: position.coords.accuracy ?? null,
        source: 'gps',
      });
      setStatus('live');
      setMessage('Ubicación en vivo · se actualiza cada 5 s');
    };

    // No bloquear la pantalla si el permiso o el GPS tardan en responder.
    fallbackTimer = setTimeout(() => {
      if (!active) return;
      setStatus((current) => (current === 'live' ? current : 'demo'));
      setMessage('Ubicación aproximada · esperando permiso o señal GPS');
    }, 8_000);

    const start = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!active) return;

        if (permission.status !== 'granted') {
          clearFallback();
          setStatus('denied');
          setMessage('Permiso de ubicación denegado · usando ubicación de demo');
          setLocation(DEMO_LOCATION);
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 60_000,
          requiredAccuracy: 250,
        });
        if (lastKnown && active) applyPosition(lastKnown);
        if (active && !lastKnown) setMessage('Conectando con el GPS…');

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5_000,
            distanceInterval: 5,
          },
          (position) => {
            if (fallbackTimer) {
              clearTimeout(fallbackTimer);
              fallbackTimer = null;
            }
            applyPosition(position);
          },
          () => {
            if (!active) return;
            clearFallback();
            setStatus('error');
            setMessage('No pudimos leer el GPS · usando ubicación de demo');
            setLocation(DEMO_LOCATION);
          },
        );
      } catch {
        if (!active) return;
        clearFallback();
        setStatus('error');
        setMessage('GPS no disponible · usando ubicación de demo');
        setLocation(DEMO_LOCATION);
      }
    };

    void start();

    return () => {
      active = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      subscription?.remove();
    };
  }, [attempt]);

  return {
    status,
    location,
    message,
    retry,
    isLive: status === 'live',
  };
}
