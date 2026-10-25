import { Platform } from 'react-native';

export const colors = {
  bg: '#06080B',
  bgElevated: '#0B0F14',
  surface: '#10151B',
  surfaceAlt: '#151B23',
  surfaceHigh: '#1B222C',
  border: '#232C38',
  borderSoft: 'rgba(255,255,255,0.07)',
  text: '#F3F6FA',
  textSoft: '#C9D1DD',
  muted: '#8792A4',
  dim: '#5A6577',
  accent: '#FF5A1F',
  accentSoft: 'rgba(255,90,31,0.14)',
  accentGlow: 'rgba(255,90,31,0.35)',
  lime: '#C9FF4D',
  limeSoft: 'rgba(201,255,77,0.13)',
  cyan: '#4DE1FF',
  green: '#2EE6A8',
  danger: '#FF4D5E',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(3,5,8,0.72)',
} as const;

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  heading: 'SpaceGrotesk_600SemiBold',
  headingMedium: 'SpaceGrotesk_500Medium',
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
