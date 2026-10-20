import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BELT_BORDER, BELT_COLOR, beltLabel } from '@/domain/belts';
import type { Belt, StripeCount } from '@/domain/types';
import { colors, radius, spacing, typography } from '@/theme/theme';

/** Pasek jako pasek: kolor + kreski. Czytelny zamiennik zdjęcia. */
interface BeltChipProps {
  readonly belt: Belt;
  readonly stripe: StripeCount;
  readonly showLabel?: boolean;
  readonly compact?: boolean;
}

export const BeltChip: React.FC<BeltChipProps> = React.memo(({ belt, stripe, showLabel = true, compact = false }) => (
  <View style={styles.row}>
    <View style={[styles.chip, compact && styles.chipCompact, { backgroundColor: BELT_COLOR[belt], borderColor: BELT_BORDER[belt] }]}>
      <View style={styles.stripes}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.stripe, { opacity: i < stripe ? 1 : 0.18 }]} />
        ))}
      </View>
    </View>
    {showLabel ? (
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
        {beltLabel(belt, stripe)}
      </Text>
    ) : null}
  </View>
));

BeltChip.displayName = 'BeltChip';

interface AvatarProps {
  readonly name: string;
  readonly seed?: string;
  readonly size?: number;
}

/** Awatar z inicjałami; kolor wyprowadzony z seed, żeby był stabilny między ekranami. */
export const Avatar: React.FC<AvatarProps> = React.memo(({ name, seed, size = 40 }) => {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
  const palette = [colors.primary, colors.success, colors.warning, colors.beltPurple, '#DB2777', '#0EA5E9'];
  const hash = (seed ?? name).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const background = palette[hash % palette.length] ?? colors.primary;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: size * 0.38, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
});

Avatar.displayName = 'Avatar';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chip: {
    width: 34,
    height: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  chipCompact: { width: 26, height: 9 },
  stripes: { flexDirection: 'row', gap: 2 },
  stripe: { width: 4, height: 3, borderRadius: 2, backgroundColor: '#0B0F14' },
  label: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  labelCompact: { fontSize: 11 },
});
