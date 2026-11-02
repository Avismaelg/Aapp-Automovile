import { Platform } from 'react-native';

import { BRAND } from '@/src/brand';

// Negro OLED con naranja Caravana. Todo el texto pasa 4,5:1 sobre los fondos
// (el antiguo «dim» se quedaba en 3,2). Sin verdes: lo que antes era lima o
// verde (acción, en vivo) va en naranja.
export const colors = {
  bg: BRAND.colors.background,
  bgElevated: '#0A0A0B',
  surface: '#0D0D0F',
  surfaceAlt: '#121215',
  surfaceHigh: '#17171A',
  border: '#2A2A30',
  borderSoft: 'rgba(255,255,255,0.08)',
  text: '#FFFFFF',
  textSoft: '#BDBDC6',
  muted: '#9A9AA5',
  dim: '#85858F',
  accent: BRAND.colors.accent,
  accentSoft: 'rgba(255,106,51,0.14)',
  accentGlow: 'rgba(255,106,51,0.35)',
  lime: BRAND.colors.accent,
  limeSoft: 'rgba(255,106,51,0.14)',
  cyan: '#3D8BFF',
  green: BRAND.colors.accent,
  danger: '#FF4D6A',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.78)',
} as const;

export const fonts = {
  // Cifras y títulos estrechos y grandes, estilo panel de carreras.
  display: 'BarlowCondensed_800ExtraBold',
  heading: 'BarlowCondensed_700Bold',
  headingMedium: 'BarlowCondensed_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  mono: 'SpaceMono',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 30,
  pill: 999,
} as const;

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.28,
      shadowRadius: 24,
    },
    android: { elevation: 6 },
    default: {},
  }),
  accent: Platform.select({
    ios: {
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 18,
    },
    android: { elevation: 8 },
    default: {},
  }),
} as const;
