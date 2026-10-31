import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { reportChallengeProgress, useChallenges } from '@/src/hooks/useChallenges';
import type { LiveLocation } from '@/src/hooks/useLiveLocation';
import { challengeProgress, placeLabel, shouldReportProgress, type Point } from '@/src/lib/convoy';

const START_KEY = (id: string) => `caravana-challenge-start-${id}`;

// Reto por llegada en curso: calcula tu avance hacia la meta, lo informa al
// servidor (que ordena la clasificación en vivo) y, al llegar, te dice tu
// puesto. Antes nadie actualizaba el avance y el anfitrión tenía que dar el
// reto por terminado a mano.
export function useChallengeRace(location: LiveLocation, enabled: boolean) {
  const { racing } = useChallenges();
  const [start, setStart] = useState<{ id: string; point: Point } | null>(null);
  const lastRef = useRef<{ pct: number; at: number } | null>(null);
  const doneRef = useRef<string | null>(null);

  const challengeId = racing?.id ?? null;
  const endLat = racing?.endLat ?? null;
  const endLng = racing?.endLng ?? null;
  const title = racing?.title ?? 'Reto';
  const goal = racing?.toLabel ?? '';

  // Punto de salida: donde estabas al empezar (se guarda por si cierras la app).
  useEffect(() => {
    if (!challengeId || !enabled) return;
    if (start?.id === challengeId) return;
    let cancelled = false;
    void (async () => {
      const saved = await AsyncStorage.getItem(START_KEY(challengeId)).catch(() => null);
      const point: Point = saved
        ? (JSON.parse(saved) as Point)
        : { latitude: location.latitude, longitude: location.longitude };
      if (!saved) await AsyncStorage.setItem(START_KEY(challengeId), JSON.stringify(point)).catch(() => {});
      if (!cancelled) {
        lastRef.current = null;
        setStart({ id: challengeId, point });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId, enabled, location, start?.id]);

  useEffect(() => {
    if (!enabled || !challengeId || endLat == null || endLng == null) return;
    if (start?.id !== challengeId) return;
    const end = { latitude: endLat, longitude: endLng };
    if (doneRef.current === challengeId) return;
    const progress = challengeProgress(start.point, end, location);
    const now = Date.now();
    if (!shouldReportProgress(lastRef.current, { pct: progress.pct, at: now, arrived: progress.arrived })) return;
    lastRef.current = { pct: progress.pct, at: now };
    if (progress.arrived) doneRef.current = challengeId;
    reportChallengeProgress(challengeId, progress.pct, progress.arrived)
      .then((rank) => {
        if (progress.arrived && rank) {
          void AsyncStorage.removeItem(START_KEY(challengeId)).catch(() => {});
          Alert.alert(placeLabel(rank), `${title} · meta: ${goal}`);
        }
      })
      .catch(() => {
        // Sin conexión: se reintenta con la siguiente posición.
        lastRef.current = null;
        if (progress.arrived) doneRef.current = null;
      });
  }, [enabled, challengeId, endLat, endLng, start, location, title, goal]);
}
