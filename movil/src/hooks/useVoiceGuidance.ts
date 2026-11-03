import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';

import { speechLanguage } from '@/src/i18n';
import { spokenInstruction } from '@/src/lib/route-instructions';
import type { RouteInstruction } from '@/src/lib/map-html';

type Upcoming = (RouteInstruction & { remainingM: number }) | null;

// MAPA-15: avisos a 500 m, 200 m y «ahora» (en el punto de la maniobra). En
// vías rápidas el «ahora» se adelanta un poco para que dé tiempo. Cada aviso
// se dice una sola vez por maniobra.
export function stageFor(remainingM: number, speedKmh: number) {
  const nowM = speedKmh >= 70 ? 80 : 40;
  if (remainingM <= nowM) return 3;
  if (remainingM <= 200) return 2;
  if (remainingM <= 500) return 1;
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
      language: speechLanguage(),
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
