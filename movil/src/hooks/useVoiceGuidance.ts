import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';

import { spokenInstruction } from '@/src/lib/route-instructions';
import type { RouteInstruction } from '@/src/lib/map-html';

type Upcoming = (RouteInstruction & { remainingM: number }) | null;

// Avisos a ~800 m (solo en vías rápidas), ~300 m y en el punto de la maniobra.
// Cada aviso se dice una sola vez por maniobra.
function stageFor(remainingM: number, speedKmh: number) {
  if (remainingM <= 60) return 3;
  if (remainingM <= 300) return 2;
  if (remainingM <= 800 && speedKmh >= 60) return 1;
  return 0;
}

export function useVoiceGuidance({
  upcoming,
  enabled,
  speedKmh,
}: {
  upcoming: Upcoming;
  enabled: boolean;
  speedKmh: number | null;
}) {
  const spokenRef = useRef<{ key: string; stage: number } | null>(null);

  useEffect(() => {
    if (!enabled || !upcoming) return;
    const key = `${upcoming.atDistanceM}|${upcoming.text}`;
    const stage = stageFor(upcoming.remainingM, speedKmh ?? 0);
    const previous = spokenRef.current;
    if (previous && previous.key === key && previous.stage >= stage) return;
    spokenRef.current = { key, stage };
    if (stage === 0) return;
    // La llegada la anuncia la pantalla del mapa al terminar la ruta.
    if (upcoming.icon === 'arrive' && stage === 3) return;
    Speech.stop();
    Speech.speak(spokenInstruction(upcoming.text, upcoming.remainingM), {
      language: 'es-ES',
      rate: 1.02,
    });
  }, [enabled, upcoming, speedKmh]);

  useEffect(() => {
    if (enabled) return;
    spokenRef.current = null;
    Speech.stop();
  }, [enabled]);

  useEffect(() => () => {
    Speech.stop();
  }, []);
}
