import * as Speech from 'expo-speech';
import { useEffect, useRef } from 'react';

import { speechLanguage } from '@/src/i18n';
import { spokenInstruction } from '@/src/lib/route-instructions';
import { useConvoyVoiceActivity } from '@/src/lib/voice-activity';
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
    const say = () => {
      Speech.stop();
      Speech.speak(spokenInstruction(upcoming.text, upcoming.remainingM), {
        language: speechLanguage(),
        rate: 1.02,
      });
    };
    // CONV-15: si habla alguien del convoy, se espera (como mucho 4 s) para no
    // pisarle; el «ahora» de la maniobra no espera.
    if (stage === 3 || !useConvoyVoiceActivity.getState().othersSpeaking) {
      say();
      return;
    }
    let waited = 0;
    const timer = setInterval(() => {
      waited += 500;
      if (!useConvoyVoiceActivity.getState().othersSpeaking || waited >= 4_000) {
        clearInterval(timer);
        say();
      }
    }, 500);
    return () => clearInterval(timer);
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
