import React from 'react';
import { Text, type TextProps, type StyleProp, type TextStyle } from 'react-native';

import { colors, typography } from '@/theme/theme';

/**
 * Typografia w jednym miejscu — ekrany nie ustawiają kolorów tekstu osobno.
 * `variant` pokrywa większość przypadków, `style` dokłada marginalne różnice.
 */
type Variant = 'display' | 'title' | 'heading' | 'body' | 'muted' | 'label' | 'caption' | 'metric';

interface AppTextProps extends TextProps {
  readonly variant?: Variant;
  readonly color?: string;
  readonly align?: 'left' | 'center' | 'right';
  readonly style?: StyleProp<TextStyle>;
}

const variantStyles: Record<Variant, TextStyle> = {
  display: typography.display,
  title: typography.title,
  heading: typography.heading,
  body: typography.body,
  muted: { ...typography.body, lineHeight: 21 },
  label: typography.label,
  caption: typography.caption,
  metric: typography.metric,
};

const variantColor: Record<Variant, string> = {
  display: colors.text,
  title: colors.text,
  heading: colors.text,
  body: colors.text,
  muted: colors.textMuted,
  label: colors.textMuted,
  caption: colors.textFaint,
  metric: colors.text,
};

export const AppText: React.FC<AppTextProps> = React.memo(({ variant = 'body', color, align, style, ...rest }) => (
  <Text {...rest} style={[variantStyles[variant], { color: color ?? variantColor[variant] }, align ? { textAlign: align } : null, style]} />
));

AppText.displayName = 'AppText';
