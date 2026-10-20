import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { icons } from '@/components/ui/icons';
import { pollClosesLabel } from '@/domain/polls';
import { colors, radius, spacing } from '@/theme/theme';
import type { PollSummary } from '@/domain/types';

interface PollCardProps {
  readonly summary: PollSummary;
  readonly now?: Date;
  readonly onVote?: (optionId: string) => void;
  readonly onPressDetail?: () => void;
  readonly pendingOptionId?: string | null;
  /** Wariant kompaktowy dla listy — bez przycisków, tylko wynik. */
  readonly compact?: boolean;
}

/**
 * Karta ankiety „co trenujemy”.
 * Pokazuje głosy, zwycięzcę i (dla członka) możliwość zmiany głosu do chwili zamknięcia.
 */
export const PollCard: React.FC<PollCardProps> = React.memo(
  ({ summary, now = new Date(), onVote, onPressDetail, pendingOptionId, compact = false }) => {
    const open = summary.status === 'open';
    const leader = summary.options.find((o) => o.isWinner);

    return (
      <Card tone={open ? 'primary' : 'default'}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="heading">
              {icons.poll} Co trenujemy
            </AppText>
            <AppText variant="muted">
              {open ? `głosowanie ${pollClosesLabel(summary.closesAt, now)}` : 'głosowanie zakończone'} · {summary.totalVotes}{' '}
              {summary.totalVotes === 1 ? 'głos' : 'głosów'}
            </AppText>
          </View>
          {leader && !open ? <Badge label="wybrane" tone="success" icon={icons.check} /> : null}
          {onPressDetail && !compact ? (
            <Button label="szczegóły" variant="secondary" small onPress={onPressDetail} />
          ) : null}
        </View>

        <View style={styles.options}>
          {summary.options.map((row) => {
            const share = summary.totalVotes > 0 ? row.votes / summary.totalVotes : 0;
            const isPending = pendingOptionId === row.option.id;
            return (
              <Pressable
                key={row.option.id}
                disabled={!summary.canVote || isPending}
                onPress={() => onVote?.(row.option.id)}
                style={({ pressed }) => [
                  styles.option,
                  row.isWinner && styles.optionWinner,
                  row.myVote && styles.optionMine,
                  summary.canVote && pressed && styles.pressed,
                ]}
              >
                <View style={styles.optionTop}>
                  <AppText variant="heading" style={styles.optionLabel} numberOfLines={2}>
                    {row.option.label}
                  </AppText>
                  <View style={styles.optionTags}>
                    {row.myVote ? <Badge label="twój głos" tone="primary" /> : null}
                    {row.option.source === 'member' ? <Badge label="od członka" tone="muted" /> : null}
                    {row.isWinner ? <Badge label={icons.crown} tone="success" /> : null}
                  </View>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.max(4, Math.round(share * 100))}%` },
                      row.isWinner ? styles.barWinner : null,
                    ]}
                  />
                </View>
                <AppText variant="caption">
                  {row.votes} {row.votes === 1 ? 'głos' : 'głosów'}
                  {summary.totalVotes > 0 ? ` · ${Math.round(share * 100)}%` : ''}
                  {isPending ? ' · zapisywanie…' : ''}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {summary.canVote ? (
          <AppText variant="caption">
            {icons.info} Jeden głos, ale możesz go zmienić do zamknięcia. Przegłosowana propozycja wygrywa — trener może podjąć inną decyzję.
          </AppText>
        ) : null}
      </Card>
    );
  }
);

PollCard.displayName = 'PollCard';

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerText: { flex: 1, gap: 2 },
  options: { gap: spacing.sm },
  option: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  optionWinner: { borderColor: 'rgba(16,185,129,0.5)' },
  optionMine: { borderColor: colors.primary },
  pressed: { opacity: 0.75 },
  optionTop: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  optionLabel: { flex: 1 },
  optionTags: { alignItems: 'flex-end', gap: spacing.xs },
  barTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.textFaint },
  barWinner: { backgroundColor: colors.success },
});
