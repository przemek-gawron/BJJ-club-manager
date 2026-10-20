import React from 'react';
import { StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/theme';
import { AppText } from './AppText';

interface TextFieldProps extends TextInputProps {
  readonly label?: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly style?: StyleProp<TextStyle>;
  readonly rightSlot?: React.ReactNode;
}

/** Pole tekstowe z etykietą i komunikatem błędu — jeden styl dla formularzy i filtra. */
export const TextField: React.FC<TextFieldProps> = React.memo(({ label, hint, error, style, rightSlot, multiline, ...rest }) => (
  <View style={styles.wrapper}>
    {label ? <AppText variant="label">{label}</AppText> : null}
    <View style={[styles.field, error ? styles.fieldError : null]}>
      <TextInput
        {...rest}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, style]}
        placeholderTextColor={colors.textFaint}
        selectionColor={colors.primary}
      />
      {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
    </View>
    {error ? <AppText color="#FFB4B4" variant="caption">{error}</AppText> : null}
    {!error && hint ? <AppText variant="caption">{hint}</AppText> : null}
  </View>
));

TextField.displayName = 'TextField';

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldError: { borderColor: colors.danger },
  input: { ...typography.body, flex: 1, color: colors.text, paddingVertical: spacing.md },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  rightSlot: { marginLeft: spacing.sm },
});
