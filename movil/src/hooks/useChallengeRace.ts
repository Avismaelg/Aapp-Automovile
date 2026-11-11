import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { reportChallengeProgress, useChallenges } from '@/src/hooks/useChallenges';
import type { LiveLocation } from '@/src/hooks/useLiveLocation';
import { parseChallengeStart } from '@/src/lib/challenge-start';
import { challengeEtaS, challengeProgress, placeLabel, shouldReportProgress, type Point } from '@/src/lib/convoy';
import { haversineMeters } from '@/src/lib/geo';
import { t } from '@/src/i18n';

const START_KEY = (id: string) => `caravana-challenge-start-${id}`;

// Reto por llegada en curso: calcula tu avance hacia la meta, lo informa al
// servidor (que ordena la clasificación en vivo) y, al llegar, te dice tu
// puesto. Antes nadie actualizaba el avance y el anfitrión tenía que dar el
// reto por terminado a mano.
// navigation: tu navegación en curso (si va hacia la meta del reto, su tiempo
// con tráfico es la ETA que se informa: RETO-05).
export function useChallengeRace(
  location: LiveLocation,
  enabled: boolean,
  navigation?: { destination: Point | null; remainingS: number | null },
) {
  const { racing } = useChallenges();
  const [start, setStart] = useState<{ id: string; point: Point } | null>(null);
  const lastRef = useRef<{ pct: number; at: number } | null>(null);
  const doneRef = useRef<string | null>(null);

  const challengeId = racing?.id ?? null;
  const endLat = racing?.endLat ?? null;
  const endLng = racing?.endLng ?? null;
  const title = racing?.title ?? t('Reto');
  const goal = racing?.toLabel ?? '';

  // La posición cambia cada segundo: el efecto de abajo la lee de aquí para no
  // reiniciarse (y cancelarse a medias) con cada señal del GPS.
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  // Punto de salida: donde estabas al empezar (se guarda por si cierras la app).
  useEffect(() => {
    if (!challengeId || !enabled) return;
    if (start?.id === challengeId) return;
    let cancelled = false;
    void (async () => {
      const saved = await AsyncStorage.getItem(START_KEY(challengeId)).catch(() => null);
      const savedPoint = parseChallengeStart(saved);
      const point: Point = savedPoint ?? {
        latitude: locationRef.current.latitude,
        longitude: locationRef.current.longitude,
      };
      // Sin dato o con un JSON inválido se guarda la posición actual; antes
      // JSON.parse lanzaba dentro del efecto y el reto se quedaba sin salida.
      if (!savedPoint) await AsyncStorage.setItem(START_KEY(challengeId), JSON.stringify(point)).catch(() => {});
      if (!cancelled) {
        lastRef.current = null;
        setStart({ id: challengeId, point });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId, enabled, start?.id]);

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
    // Si navegas hacia la meta (destino a < 150 m de ella), vale su tiempo.
    const towardGoal =
      navigation?.destination != null && haversineMeters(navigation.destination, end) < 150;
    const etaS = progress.arrived
      ? 0
      : challengeEtaS(progress.leftM, location.speedKmh ?? null, towardGoal ? (navigation?.remainingS ?? null) : null);
    reportChallengeProgress(
      challengeId,
      progress.pct,
      progress.arrived,
      { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy ?? null },
      etaS,
    )
      .then((rank) => {
        if (progress.arrived && rank) {
          void AsyncStorage.removeItem(START_KEY(challengeId)).catch(() => {});
          Alert.alert(placeLabel(rank), t('{0} · meta: {1}', title, goal));
        }
      })
      .catch(() => {
        // Sin conexión: se reintenta con la siguiente posición.
        lastRef.current = null;
        if (progress.arrived) doneRef.current = null;
      });
  }, [enabled, challengeId, endLat, endLng, start, location, title, goal, navigation?.destination, navigation?.remainingS]);
}
