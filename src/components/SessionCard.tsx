import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './ui/AppText';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { icons } from './ui/icons';
import { addMinutes, formatWarsawTime, relativeDayLabel } from '@/lib/poland-time';
import { colors, radius, spacing } from '@/theme/theme';
import type { SessionWithClass } from '@/domain/types';

interface SessionCardProps {
  readonly session: SessionWithClass;
  readonly now?: Date;
  readonly onPress: () => void;
  /** Trener widzi frekwencję i status ankiety; członek — przyciski zapisu. */
  readonly coachView?: boolean;
}

export const SESSION_STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'primary' | 'muted' }> = {
  scheduled: { label: 'zaplanowane', tone: 'muted' },
  cancelled: { label: 'odwołane', tone: 'danger' },
  finished: { label: 'zakończone', tone: 'primary' },
};

function seatsLabel(session: SessionWithClass): string | null {
  const capacity = session.capacityOverride ?? session.classTemplate.capacity;
  if (capacity == null) return null;
  const left = capacity - session.signupCount;
  if (left > 0) return `wolne miejsca: ${left}/${capacity}`;
  return session.waitlistCount > 0 ? `brak miejsc — rezerwa: ${session.waitlistCount}` : 'brak miejsc';
}

/** Karta jednych zajęć — wspólna dla „Dziś”, grafiku i szczegółów. */
export const SessionCard: React.FC<SessionCardProps> = React.memo(({ session, now = new Date(), onPress, coachView = false }) => {
  const status = SESSION_STATUS_LABEL[session.status] ?? SESSION_STATUS_LABEL.scheduled!;
  const seats = seatsLabel(session);
  const started = new Date(session.startsAt).getTime() <= now.getTime();
  const checkInOpens = addMinutes(new Date(session.startsAt), -60);
  const checkInOpen = started || (checkInOpens.getTime() <= now.getTime() && !started);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <Card tone={session.status === 'cancelled' ? 'danger' : session.isCheckedIn ? 'success' : 'default'} style={styles.card}>
        <View style={styles.headerRow}>
          <View style={[styles.colorBar, { backgroundColor: session.classTemplate.color }]} />
          <View style={styles.headText}>
            <AppText variant="heading" numberOfLines={1}>
              {session.classTemplate.name}
            </AppText>
            <AppText variant="muted">
              {relativeDayLabel(new Date(session.startsAt), now)} · {formatWarsawTime(new Date(session.startsAt))}–
              {formatWarsawTime(new Date(session.endsAt))}
            </AppText>
          </View>
          <View style={styles.badges}>
            {session.status !== 'scheduled' ? <Badge label={status.label} tone={status.tone} /> : null}
            {session.isCheckedIn ? <Badge label="na macie" tone="success" icon={icons.check} /> : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          <Badge label={session.classTemplate.level === 'all' ? 'wszyscy' : session.classTemplate.level} tone="muted" />
          <Badge label={`prowadzi ${session.coachName ?? ''}`} tone="muted" />
          {session.pollId ? (
            <Badge
              label={session.pollStatus === 'open' ? `ankieta · ${session.pollVotesCount} głos.` : 'ankieta zamknięta'}
              tone={session.pollStatus === 'open' ? 'primary' : 'muted'}
              icon={icons.poll}
            />
          ) : null}
        </View>

        {coachView ? (
          <View style={styles.metaRow}>
            <Badge label={`zapisanych ${session.signupCount}`} tone="neutral" />
            {session.waitlistCount > 0 ? <Badge label={`rezerwa ${session.waitlistCount}`} tone="warning" /> : null}
            <Badge label={`obecnych ${session.attendanceCount}`} tone={session.attendanceCount > 0 ? 'success' : 'muted'} />
          </View>
        ) : (
          <View style={styles.metaRow}>
            {session.isSignedUp ? (
              <Badge label="masz miejsce" tone="success" icon={icons.check} />
            ) : session.isWaitlisted ? (
              <Badge label={`rezerwa · pozycja ${session.myWaitlistPosition ?? '?'}`} tone="warning" />
            ) : (
              <Badge label="nie zapisany" tone="muted" />
            )}
            {seats ? <Badge label={seats} tone="muted" /> : <Badge label="bez limitu miejsc" tone="muted" />}
          </View>
        )}

        {session.status === 'cancelled' && session.cancelledReason ? (
          <AppText variant="muted" style={styles.reason}>
            Powód odwołania: {session.cancelledReason}
          </AppText>
        ) : null}

        {!coachView && !session.isSignedUp && session.status === 'scheduled' && !started ? (
          <AppText variant="caption">
            {checkInOpen ? '' : `Zapisy otwarte, check-in od ${formatWarsawTime(checkInOpens)}.`}
          </AppText>
        ) : null}
      </Card>
    </Pressable>
  );
});

SessionCard.displayName = 'SessionCard';

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  pressed: { opacity: 0.85 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  colorBar: { width: 4, height: 34, borderRadius: radius.sm },
  headText: { flex: 1, gap: 1 },
  badges: { alignItems: 'flex-end', gap: spacing.xs },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  reason: { fontStyle: 'italic' },
});
