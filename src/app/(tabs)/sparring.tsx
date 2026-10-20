import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar, BeltChip } from '@/components/ui/BeltChip';
import { EmptyState, Screen, SectionHeader } from '@/components/ui/Screen';
import { icons } from '@/components/ui/icons';
import { useClearSparringIntent, useSessions, useSparringBoard, useSparringIntent } from '@/hooks/queries';
import { FOCUS_LABEL, INTENSITY_LABEL, SPARRING_FOCUSES, SPARRING_INTENSITIES, boardSummary } from '@/domain/sparring';
import { formatWarsawTime, relativeDayLabel } from '@/lib/poland-time';
import { colors, radius, spacing } from '@/theme/theme';
import type { SparringFocus, SparringIntensity } from '@/domain/types';

interface Declaration {
  readonly sessionId: string;
  readonly intensity: SparringIntensity;
  readonly focus: SparringFocus;
}

/**
 * Tablica sparów: wybierasz najbliższe zajęcia, deklarujesz intensywność i fokus,
 * a algorytm ranguje partnerów (pas, masa, staż, fokus, intensywność).
 */
export default function SparringScreen() {
  const sessionsQuery = useSessions();
  const [now] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intensity, setIntensity] = useState<SparringIntensity>('technical');
  const [focus, setFocus] = useState<SparringFocus>('any');
  const [declaration, setDeclaration] = useState<Declaration | null>(null);

  const options = useMemo(
    () =>
      (sessionsQuery.data ?? [])
        .filter((s) => s.status === 'scheduled' && new Date(s.endsAt).getTime() >= now.getTime())
        .slice(0, 8),
    [sessionsQuery.data, now]
  );

  const sessionId = options.some((o) => o.id === selectedId) ? selectedId : (options[0]?.id ?? null);
  const board = useSparringBoard(sessionId ?? undefined);
  const setIntent = useSparringIntent();
  const clearIntent = useClearSparringIntent();
  const candidates = board.data ?? [];

  const onSessionId = Boolean(sessionId);
  const declaredHere = declaration && declaration.sessionId === sessionId ? declaration : null;

  const declare = useCallback(() => {
    if (!sessionId) return;
    setIntent.mutate(
      { sessionId, intensity, focus },
      { onSuccess: (result) => setDeclaration(result.ok ? { sessionId, intensity, focus } : null) }
    );
  }, [sessionId, intensity, focus, setIntent]);

  const withdraw = useCallback(() => {
    if (!sessionId) return;
    clearIntent.mutate({ sessionId }, { onSuccess: () => setDeclaration(null) });
  }, [sessionId, clearIntent]);

  return (
    <Screen refreshing={board.isRefetching || sessionsQuery.isRefetching} onRefresh={() => void board.refetch()} testID="sparring-screen">
      <SectionHeader title="Tablica sparów" subtitle="Powiedz, jak chcesz potrenować — dobierzemy partnerów" icon={icons.sparring} />

      {options.length === 0 && !sessionsQuery.isLoading ? (
        <EmptyState icon={icons.calendarOff} title="Brak najbliższych zajęć" message="Tablica działa dla zaplanowanych zajęć — zajrzyj do grafiku." />
      ) : null}

      {options.length > 0 ? (
        <Card compact>
          <AppText variant="label">Zajęcia</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker} testID="sparring-picker">
            {options.map((session) => {
              const active = session.id === sessionId;
              return (
                <Pressable
                  key={session.id}
                  onPress={() => setSelectedId(session.id)}
                  accessibilityRole="button"
                  testID={`sparring-session-${session.id}`}
                  style={[styles.pickChip, active && styles.pickChipActive]}
                >
                  <AppText variant="caption">{relativeDayLabel(new Date(session.startsAt), now)}</AppText>
                  <AppText variant="label" color={active ? colors.text : colors.textMuted} numberOfLines={1}>
                    {session.classTemplate.name}
                  </AppText>
                  <AppText variant="caption">{formatWarsawTime(new Date(session.startsAt))}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </Card>
      ) : null}

      <Card tone={declaredHere ? 'success' : 'default'}>
        <AppText variant="heading">
          {declaredHere
            ? `${icons.check} Twoje zgłoszenie: ${INTENSITY_LABEL[declaredHere.intensity]} · ${FOCUS_LABEL[declaredHere.focus]}`
            : `${icons.note} Szukam partnera do sparingu`}
        </AppText>
        <AppText variant="muted">Zgłoszenie wygasa po 12 godzinach. Widzą je tylko członkowie klubu.</AppText>

        <View style={styles.chipRow}>
          {SPARRING_INTENSITIES.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setIntensity(value)}
              testID={`intensity-${value}`}
              style={[styles.chip, intensity === value && styles.chipActive]}
            >
              <AppText variant="label" color={intensity === value ? colors.text : colors.textMuted}>
                {INTENSITY_LABEL[value]}
              </AppText>
            </Pressable>
          ))}
        </View>
        <View style={styles.chipRow}>
          {SPARRING_FOCUSES.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPress={() => setFocus(value)}
              testID={`focus-${value}`}
              style={[styles.chip, focus === value && styles.chipActive]}
            >
              <AppText variant="label" color={focus === value ? colors.text : colors.textMuted}>
                {FOCUS_LABEL[value]}
              </AppText>
            </Pressable>
          ))}
        </View>

        <View style={styles.actions}>
          <Button
            label={declaredHere ? 'Odśwież zgłoszenie' : 'Wchodzę na tablicę'}
            loading={setIntent.isPending}
            disabled={!onSessionId}
            onPress={declare}
            style={styles.action}
            testID="declare-intent"
          />
          {declaredHere ? (
            <Button label="Wypisz mnie" variant="ghost" onPress={withdraw} loading={clearIntent.isPending} testID="clear-intent" />
          ) : null}
        </View>
        {setIntent.data && !setIntent.data.ok ? <AppText variant="caption" color="#FFB4B4">{setIntent.data.message}</AppText> : null}
        {clearIntent.data && !clearIntent.data.ok ? <AppText variant="caption" color="#FFB4B4">{clearIntent.data.message}</AppText> : null}
      </Card>

      <SectionHeader title="Kandydaci" subtitle={boardSummary(candidates)} />
      {candidates.length === 0 && !board.isLoading ? (
        <EmptyState
          icon={icons.sparring}
          title="Tablica jest pusta"
          message="Dodaj zgłoszenie — inni zobaczą je od razu i będą mogli wybrać ciebie."
        />
      ) : null}
      {candidates.map((candidate) => {
        const tone = candidate.compatibility >= 80 ? 'success' : candidate.compatibility >= 60 ? 'primary' : 'default';
        return (
          <Card key={candidate.member.id} tone={tone}>
            <View style={styles.candidateRow}>
              <Avatar name={candidate.member.displayName} seed={candidate.member.avatarSeed} />
              <View style={styles.candidateText}>
                <AppText variant="heading" numberOfLines={1}>
                  {candidate.member.displayName}
                </AppText>
                <BeltChip belt={candidate.member.belt} stripe={candidate.member.stripe} />
                <AppText variant="caption">{candidate.member.weightBand}</AppText>
              </View>
              <View style={styles.scoreBox}>
                <AppText variant="metric" color={candidate.compatibility >= 70 ? colors.success : colors.text}>
                  {candidate.compatibility}
                </AppText>
                <AppText variant="caption">dopasowanie</AppText>
              </View>
            </View>
            <View style={styles.chipRow}>
              <Badge label={INTENSITY_LABEL[candidate.intent.intensity]} tone="neutral" />
              <Badge label={FOCUS_LABEL[candidate.intent.focus]} tone="muted" />
              {candidate.beltGap >= 2 ? <Badge label="duża różnica poziomu" tone="warning" icon={icons.warning} /> : null}
              {candidate.weightDeltaKg != null && candidate.weightDeltaKg > 12 ? <Badge label={`różnica ${candidate.weightDeltaKg} kg`} tone="warning" /> : null}
            </View>
            <AppText variant="muted">{candidate.reasons.join(' · ')}</AppText>
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: { gap: spacing.sm, paddingVertical: spacing.xs },
  pickChip: {
    minWidth: 132,
    padding: spacing.sm,
    gap: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pickChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  action: { minWidth: 160 },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  candidateText: { flex: 1, gap: 2 },
  scoreBox: { alignItems: 'flex-end' },
});
