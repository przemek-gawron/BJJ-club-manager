import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Screen, SectionHeader, TAB_SCREEN_EDGES } from '@/components/ui/Screen';
import { icons } from '@/components/ui/icons';
import { SessionCard } from '@/components/SessionCard';
import { useSessions, useSyncSchedule, useTemplates } from '@/hooks/queries';
import { useAuth } from '@/state/AuthContext';
import { WEEKDAY_SHORT_PL, addWarsawDays, formatWarsawDate, pad, startOfWarsawWeek } from '@/lib/poland-time';
import { colors, radius, spacing } from '@/theme/theme';
import type { ClassTemplate } from '@/domain/types';

/** Grafik: cotygodniowe szablony zajęć + lista nadchodzących sesji z zapisami. */
export default function ScheduleScreen() {
  const { isStaff } = useAuth();
  const sessionsQuery = useSessions();
  const templatesQuery = useTemplates();
  const sync = useSyncSchedule();
  const [now] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => addWarsawDays(startOfWarsawWeek(now), weekOffset * 7), [now, weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addWarsawDays(weekStart, index)), [weekStart]);

  const templatesByDay = useMemo(() => {
    const byDay = new Map<number, ClassTemplate[]>();
    for (const template of templatesQuery.data ?? []) {
      if (!template.active) continue;
      const list = byDay.get(template.weekday) ?? [];
      list.push(template);
      byDay.set(template.weekday, list);
    }
    for (const list of byDay.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return byDay;
  }, [templatesQuery.data]);

  const sessions = sessionsQuery.data ?? [];
  const upcoming = useMemo(() => sessions.filter((s) => new Date(s.endsAt).getTime() >= now.getTime()), [sessions, now]);
  const weekKey = `${weekStart.toISOString()}-${weekOffset}`;

  return (
    <Screen refreshing={sessionsQuery.isRefetching} onRefresh={() => void sessionsQuery.refetch()} testID="schedule-screen" edges={TAB_SCREEN_EDGES}>
      <SectionHeader
        title="Grafik"
        subtitle="Szablony tygodniowe i nadchodzące zajęcia z zapisami"
        icon={icons.calendar}
        action={
          weekOffset !== 0 ? <Button label="dzisiaj" variant="ghost" small onPress={() => setWeekOffset(0)} /> : undefined
        }
      />

      <Card compact>
        <View style={styles.weekNav}>
          <Button label="‹ poprzedni" variant="secondary" small onPress={() => setWeekOffset((v) => v - 1)} testID="week-back" />
          <View style={styles.weekLabel}>
            <AppText variant="heading">{formatWarsawDate(weekStart)}</AppText>
            <AppText variant="caption">{weekOffset === 0 ? 'bieżący tydzień' : `tydzień ${weekOffset > 0 ? '+' : ''}${weekOffset}`}</AppText>
          </View>
          <Button label="następny ›" variant="secondary" small onPress={() => setWeekOffset((v) => v + 1)} testID="week-forward" />
        </View>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip} testID="week-templates">
        {days.map((day, index) => {
          const dayTemplates = templatesByDay.get(index) ?? [];
          return (
            <View key={`${weekKey}-${index}`} style={styles.dayColumn}>
              <View style={styles.dayHeader}>
                <AppText variant="label">{WEEKDAY_SHORT_PL[index] ?? ''}</AppText>
                <AppText variant="caption">{pad(new Date(day).getDate())}</AppText>
              </View>
              {dayTemplates.length === 0 ? <AppText variant="caption">bez zajęć</AppText> : null}
              {dayTemplates.map((template) => (
                <View key={template.id} style={[styles.templateChip, { borderLeftColor: template.color }]}>
                  <AppText style={styles.templateTime}>{template.startTime}</AppText>
                  <AppText variant="caption" style={styles.templateName} numberOfLines={2}>
                    {template.name}
                  </AppText>
                  <AppText variant="caption">{template.capacity == null ? 'bez limitu' : `${template.capacity} miejsc`}</AppText>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {isStaff ? (
        <Card tone="alt">
          <View style={styles.row}>
            <View style={styles.rowText}>
              <AppText variant="heading">{icons.refresh} Synchronizacja grafiku</AppText>
              <AppText variant="muted">Tworzy sesje ze szablonów na 3 tygodnie w przód; istniejących nie duplikuje.</AppText>
            </View>
            <Button
              label="Synchronizuj"
              small
              loading={sync.isPending}
              onPress={() => sync.mutate(undefined, { onSuccess: () => void sessionsQuery.refetch() })}
              testID="sync-schedule"
            />
          </View>
          {sync.data ? <AppText variant="caption">{sync.data.message}</AppText> : null}
          {sync.isError ? <AppText variant="caption" color="#FFB4B4">Nie udało się zsynchronizować grafiku.</AppText> : null}
          <AppText variant="caption">
            {icons.settings} Szablony zajęć zarządzasz w zakładce Klub.
          </AppText>
        </Card>
      ) : null}

      <SectionHeader title="Nadchodzące zajęcia" subtitle={`${upcoming.length} w najbliższych 3 tygodniach`} icon={icons.clock} />
      {sessionsQuery.isError ? (
        <ErrorState
          error={sessionsQuery.error}
          hint="Grafik pobieramy z serwera przy każdym odświeżeniu ekranu."
          onRetry={() => void sessionsQuery.refetch()}
          testID="schedule-error"
        />
      ) : upcoming.length === 0 && !sessionsQuery.isLoading ? (
        <EmptyState icon={icons.calendarOff} title="Nic zaplanowanego" message="W najbliższych trzech tygodniach nie ma zajęć w kalendarzu." />
      ) : null}
      {upcoming.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          now={now}
          coachView={isStaff}
          onPress={() => router.push(`/session/${session.id}`)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  weekLabel: { alignItems: 'center', gap: 2, flex: 1 },
  weekStrip: { gap: spacing.sm, paddingVertical: spacing.xs },
  dayColumn: {
    width: 126,
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  templateChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    gap: 1,
  },
  templateTime: { color: colors.text, fontSize: 13, fontWeight: '700' },
  templateName: { color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
});
