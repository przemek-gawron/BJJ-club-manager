import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, radius, spacing } from '@/theme/theme';

type Tone = 'default' | 'alt' | 'primary' | 'success' | 'warning' | 'danger';

interface CardProps {
  readonly children: React.ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly tone?: Tone;
  readonly compact?: boolean;
  readonly testID?: string;
}

const toneStyles: Record<Tone, { backgroundColor: string; borderColor: string }> = {
  default: { backgroundColor: colors.surface, borderColor: colors.border },
  alt: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  primary: { backgroundColor: colors.primarySoft, borderColor: 'rgba(47,111,237,0.45)' },
  success: { backgroundColor: colors.successSoft, borderColor: 'rgba(16,185,129,0.45)' },
  warning: { backgroundColor: colors.warningSoft, borderColor: 'rgba(245,158,11,0.45)' },
  danger: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(239,68,68,0.45)' },
};

export const Card: React.FC<CardProps> = ({ children, style, tone = 'default', compact = false, testID }) => (
  <View testID={testID} style={[styles.base, compact && styles.compact, toneStyles[tone], layout.cardShadow, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  base: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  compact: { padding: spacing.md, gap: spacing.xs },
});
