import { Platform } from 'react-native';

/** Ciemny motyw inspirowany matą i pasami BJJ. Jeden plik = spójny wygląd. */
export const colors = {
  bg: '#0B0F14',
  surface: '#141A22',
  surfaceAlt: '#1C242F',
  border: '#26313E',
  borderStrong: '#33414F',

  text: '#EAF0F6',
  textMuted: '#8C9BAC',
  textFaint: '#5B6B7C',

  primary: '#2F6FED',
  primarySoft: 'rgba(47, 111, 237, 0.16)',
  success: '#10B981',
  successSoft: 'rgba(16, 185, 129, 0.16)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.16)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.16)',

  beltWhite: '#E8EAED',
  beltBlue: '#2F6FED',
  beltPurple: '#8B5CF6',
  beltBrown: '#A16207',
  beltBlack: '#111827',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.2 },
  caption: { fontSize: 12, fontWeight: '400' as const },
  metric: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.8 },
} as const;

export const layout = {
  /** Bezpieczny margines ekranu, nieco mniejszy na tablecie. */
  screenPadding: spacing.lg,
  cardGap: spacing.md,
  /** iOS lubi cień, Android lepiej wygląda z obwódką. */
  cardShadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 3 },
    default: {},
  }) as object,
} as const;
