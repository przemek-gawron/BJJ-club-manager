import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

interface ButtonProps {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: Variant;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly fullWidth?: boolean;
  readonly small?: boolean;
  readonly icon?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
  /** Etykieta dostępności — ważna, gdy sam tekst by niejednoznaczny (np. pięć razy «wpisz»). */
  readonly accessibilityLabel?: string;
}

const variantStyles: Record<Variant, { container: ViewStyle; text: string }> = {
  primary: { container: { backgroundColor: colors.primary, borderColor: colors.primary }, text: '#FFFFFF' },
  secondary: { container: { backgroundColor: 'transparent', borderColor: colors.borderStrong }, text: colors.text },
  ghost: { container: { backgroundColor: 'transparent', borderColor: 'transparent' }, text: colors.textMuted },
  danger: { container: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(239,68,68,0.5)' }, text: '#FFB4B4' },
  success: { container: { backgroundColor: colors.successSoft, borderColor: 'rgba(16,185,129,0.5)' }, text: '#8CF0CE' },
};

export const Button: React.FC<ButtonProps> = React.memo(
  ({ label, onPress, variant = 'primary', disabled, loading, fullWidth, small, icon, style, testID, accessibilityLabel }) => {
    const tone = variantStyles[variant];
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: Boolean(disabled || loading) }}
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.base,
          small && styles.small,
          fullWidth && styles.full,
          tone.container,
          (disabled || loading) && styles.disabled,
          pressed && styles.pressed,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={tone.text} />
        ) : (
          <View style={styles.content}>
            {icon ? <Text style={[styles.icon, { color: tone.text }]}>{icon}</Text> : null}
            <Text style={[styles.label, small && styles.smallLabel, { color: tone.text }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    );
  }
);

Button.displayName = 'Button';

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 38, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  full: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.heading, color: colors.text },
  smallLabel: { ...typography.label },
  icon: { fontSize: 15 },
});
