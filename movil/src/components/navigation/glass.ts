import { createContext, useContext } from 'react';
import type { ViewStyle } from 'react-native';

import { colors } from '@/src/theme';

// Fondo translúcido de los controles que flotan sobre el mapa.
export const GLASS = 'rgba(6,8,11,0.74)';

// Colores de los controles sobre el mapa: tarjetas blancas con sombra sobre
// el mapa de día (como Google Maps) y oscuras sobre el de noche.
export type MapChrome = {
  day: boolean;
  bg: string;
  border: string;
  text: string;
  textSoft: string;
  muted: string;
  chip: string;
  surface: ViewStyle;
};

const SHADOW: ViewStyle = {
  shadowColor: '#000000',
  shadowOpacity: 0.16,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 5,
};

function chrome(day: boolean): MapChrome {
  const bg = day ? '#ffffff' : 'rgba(17,22,30,0.95)';
  const border = day ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.1)';
  return {
    day,
    bg,
    border,
    text: day ? '#0f172a' : colors.text,
    textSoft: day ? '#334155' : colors.textSoft,
    muted: day ? '#64748b' : colors.muted,
    chip: day ? '#f1f5f9' : 'rgba(255,255,255,0.06)',
    surface: { backgroundColor: bg, borderColor: border, borderWidth: 1, ...SHADOW },
  };
}

export const DAY_CHROME = chrome(true);
export const NIGHT_CHROME = chrome(false);

export const MapChromeContext = createContext<MapChrome>(NIGHT_CHROME);

export function useMapChrome() {
  return useContext(MapChromeContext);
}
