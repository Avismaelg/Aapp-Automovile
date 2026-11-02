import { createContext, useContext } from 'react';
import type { ViewStyle } from 'react-native';

import { colors } from '@/src/theme';
import { BRAND } from '@/src/brand';

// Colores de los controles sobre el mapa: paneles blancos de día y negros
// OLED de noche, con el naranja Caravana como acento.
export type MapChrome = {
  day: boolean;
  bg: string;
  border: string;
  text: string;
  textSoft: string;
  muted: string;
  chip: string;
  // Acento (naranja) y el color que va encima de él.
  accent: string;
  onAccent: string;
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
  const bg = day ? '#ffffff' : '#0D0D0F';
  const border = day ? '#DADCE2' : '#2A2A30';
  return {
    day,
    bg,
    border,
    text: day ? '#0B0B0D' : colors.text,
    textSoft: day ? '#3F3F46' : colors.textSoft,
    muted: day ? '#5F5F6A' : colors.muted,
    chip: day ? '#F2F2F5' : '#17171A',
    accent: day ? BRAND.colors.accentDay : colors.accent,
    onAccent: day ? '#FFFFFF' : '#000000',
    surface: { backgroundColor: bg, borderColor: border, borderWidth: 1, ...SHADOW },
  };
}

export const DAY_CHROME = chrome(true);
export const NIGHT_CHROME = chrome(false);

export const MapChromeContext = createContext<MapChrome>(NIGHT_CHROME);

export function useMapChrome() {
  return useContext(MapChromeContext);
}
