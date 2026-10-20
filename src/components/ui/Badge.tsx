import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/theme';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

interface BadgeProps {
  readonly label: string;
  readonly tone?: Tone;
  readonly icon?: string;
  readonly style?: StyleProp<ViewStyle>;
}

const toneStyles: Record<Tone, { backgroundColor: string; borderColor: string; color: string }> = {
  neutral: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong, color: colors.text },
  primary: { backgroundColor: colors.primarySoft, borderColor: 'rgba(47,111,237,0.45)', color: '#BFD3FF' },
  success: { backgroundColor: colors.successSoft, borderColor: 'rgba(16,185,129,0.45)', color: '#8CF0CE' },
  warning: { backgroundColor: colors.warningSoft, borderColor: 'rgba(245,158,11,0.45)', color: '#FFD98A' },
  danger: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(239,68,68,0.45)', color: '#FFB4B4' },
  muted: { backgroundColor: 'transparent', borderColor: colors.border, color: colors.textMuted },
};

/** Mała pigułka statusu — używana dla pasów, zapisów, statusów ankiety. */
export const Badge: React.FC<BadgeProps> = React.memo(({ label, tone = 'neutral', icon, style }) => {
  const colorsFor = toneStyles[tone];
  return (
    <View style={[styles.base, { backgroundColor: colorsFor.backgroundColor, borderColor: colorsFor.borderColor }, style]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.label, { color: colorsFor.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

Badge.displayName = 'Badge';

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { ...typography.caption, fontWeight: '600' },
  icon: { fontSize: 11 },
});
