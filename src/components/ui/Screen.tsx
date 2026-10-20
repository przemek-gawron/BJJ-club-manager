import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/theme/theme';
import { AppText } from './AppText';
import { icons } from './icons';

type SafeEdge = 'top' | 'bottom' | 'left' | 'right';

/** Krawędzie dla ekranów w zakładkach — ich nawigator ma `headerShown: false`, więc górny margines bierzemy sami. */
export const TAB_SCREEN_EDGES: ReadonlyArray<SafeEdge> = ['top', 'bottom'];

interface ScreenProps {
  readonly children: React.ReactNode;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
  readonly scroll?: boolean;
  readonly testID?: string;
  /**
   * Krawędzie safe area. Domyślnie tylko dół: ekran w stosu ma nagłówek, który sam
   * odprowadza górnym marginesem. Zakładki ukrywają nagłówek i muszą przekazać `['top', 'bottom']`,
   * inaczej tytuł wchodzi pod wyspę dynamiczną i zegar.
   */
  readonly edges?: ReadonlyArray<SafeEdge>;
}

/** Wspólna ramka ekranu: tło, safe area, odstęp i odświeżanie gestem. */
export const Screen: React.FC<ScreenProps> = ({ children, refreshing, onRefresh, scroll = true, testID, edges = ['bottom'] }) => {
  const body = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView edges={[...edges]} style={styles.safe} testID={testID}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: layout.screenPadding, paddingBottom: spacing.xxl, gap: spacing.md },
  content: { gap: spacing.md },
});

interface SectionHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: React.ReactNode;
  readonly icon?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, action, icon }) => (
  <View style={headerStyles.row}>
    <View style={headerStyles.textBlock}>
      <AppText variant="title">
        {icon ? `${icon} ` : ''}
        {title}
      </AppText>
      {subtitle ? <AppText variant="muted">{subtitle}</AppText> : null}
    </View>
    {action}
  </View>
);

const headerStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.sm },
  textBlock: { flex: 1, gap: 2 },
});

interface EmptyStateProps {
  readonly title: string;
  readonly message?: string;
  readonly icon?: string;
  readonly action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, message, icon = icons.info, action }) => (
  <View style={emptyStyles.box}>
    <AppText style={emptyStyles.icon}>{icon}</AppText>
    <AppText variant="heading" align="center">
      {title}
    </AppText>
    {message ? (
      <AppText variant="muted" align="center">
        {message}
      </AppText>
    ) : null}
    {action}
  </View>
);

const emptyStyles = StyleSheet.create({
  box: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  icon: { fontSize: 30 },
});
