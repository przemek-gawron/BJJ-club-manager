import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, Screen, SectionHeader, TAB_SCREEN_EDGES } from '@/components/ui/Screen';
import { icons } from '@/components/ui/icons';
import { SessionCard } from '@/components/SessionCard';
import { PollCard } from '@/components/PollCard';
import { api } from '@/data/api-client';
import { useClubName, usePoll, useSessions, useTodaysAttendance, useVote } from '@/hooks/queries';
import { useAuth } from '@/state/AuthContext';
import { addWarsawDays, formatWarsawDate, startOfWarsawDay } from '@/lib/poland-time';
import { spacing } from '@/theme/theme';
import type { SessionWithClass } from '@/domain/types';

function onDay(session: SessionWithClass, dayStart: Date): boolean {
  return startOfWarsawDay(new Date(session.startsAt)).getTime() === dayStart.getTime();
}

/** Ekran „Dziś”: najbliższe zajęcia, ankieta tematyczna i szybki check-in. */
export default function TodayScreen() {
  const { member, isStaff, signOut } = useAuth();
  const sessionsQuery = useSessions();
  const clubName = useClubName();
  const attendance = useTodaysAttendance();
  const [now] = useState(() => new Date());

  const sessions = sessionsQuery.data ?? [];

  const { today, tomorrow, later } = useMemo(() => {
    const dayStart = startOfWarsawDay(now);
    const tomorrowStart = addWarsawDays(dayStart, 1);
    const upcoming = sessions
      .filter((s) => new Date(s.endsAt).getTime() >= now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return {
      today: upcoming.filter((s) => onDay(s, dayStart)),
      tomorrow: upcoming.filter((s) => onDay(s, tomorrowStart)),
      later: upcoming.filter((s) => !onDay(s, dayStart) && !onDay(s, tomorrowStart)).slice(0, 4),
    };
  }, [sessions, now]);

  const nextSession = today[0] ?? tomorrow[0] ?? later[0] ?? null;
  const pollQuery = usePoll(nextSession?.id);
  const vote = useVote();

  const openSession = (id: string) => router.push(`/session/${id}`);

  return (
    <Screen
      refreshing={sessionsQuery.isRefetching || attendance.isRefetching}
      onRefresh={() => {
        void sessionsQuery.refetch();
        void attendance.refetch();
      }}
      testID="today-screen"
      edges={TAB_SCREEN_EDGES}
    >
      <View style={styles.topRow}>
        <View style={styles.topText}>
          <AppText variant="caption">{clubName.data ?? 'BJJ Club'}</AppText>
          <AppText variant="title">Cześć, {member?.firstName || 'klubowiczu'}</AppText>
        </View>
        {isStaff ? <Button label="klub" icon={icons.settings} variant="secondary" small onPress={() => router.push('/admin')} testID="open-admin" /> : null}
      </View>

      {member && member.membership !== 'active' ? (
        <Card tone="warning">
          <AppText variant="heading">{icons.warning} Memberskie wstrzymane</AppText>
          <AppText variant="muted">
            Twoje członkostwo nie jest aktywne — zapisy i meldunki są zablokowane. Trener odmrozi je w katalogu klubu.
          </AppText>
        </Card>
      ) : null}

      <Card tone="primary">
        <View style={styles.checkInRow}>
          <View style={styles.checkInText}>
            <AppText variant="heading">{icons.scan} Check-in przy drzwiach</AppText>
            <AppText variant="muted">Zeskanuj kod na ścianie — meldunek liczy się do passy i statystyk klubu.</AppText>
          </View>
          <Button label="skanuj" onPress={() => router.push('/check-in')} testID="open-check-in" />
        </View>
        {attendance.data && attendance.data.length > 0 ? (
          <AppText variant="caption">
            {icons.flame} Dzisiaj zameldowało się {attendance.data.length}{' '}
            {attendance.data.length === 1 ? 'osoba' : 'osób'} — dołącz do nich.
          </AppText>
        ) : null}
      </Card>

      {pollQuery.data ? (
        <>
          <SectionHeader
            title="Temat zajęć"
            subtitle="Klub decyduje większością głosów"
            icon={icons.poll}
            action={
              nextSession ? (
                <Button label="zajęcia" variant="ghost" small onPress={() => openSession(nextSession.id)} />
              ) : undefined
            }
          />
          <PollCard
            summary={pollQuery.data}
            now={now}
            pendingOptionId={vote.isPending ? vote.variables?.optionId ?? null : null}
            onVote={(optionId) => vote.mutate({ pollId: pollQuery.data!.poll.id, optionId })}
          />
        </>
      ) : null}

      {today.length > 0 ? <SectionHeader title="Dzisiaj" subtitle={formatWarsawDate(now)} icon={icons.clock} /> : null}
      {today.map((session) => (
        <SessionCard key={session.id} session={session} now={now} coachView={isStaff} onPress={() => openSession(session.id)} />
      ))}

      {tomorrow.length > 0 ? <SectionHeader title="Jutro" icon={icons.calendar} /> : null}
      {tomorrow.map((session) => (
        <SessionCard key={session.id} session={session} now={now} coachView={isStaff} onPress={() => openSession(session.id)} />
      ))}

      {later.length > 0 ? (
        <SectionHeader
          title="Kolejne dni"
          icon={icons.calendar}
          action={<Button label="cały grafik" variant="ghost" small onPress={() => router.push('/(tabs)/schedule')} />}
        />
      ) : null}
      {later.map((session) => (
        <SessionCard key={session.id} session={session} now={now} coachView={isStaff} onPress={() => openSession(session.id)} />
      ))}

      {sessions.length === 0 && !sessionsQuery.isLoading ? (
        <EmptyState
          icon={icons.calendarOff}
          title="Brak zajęć w kalendarzu"
          message={
            api.mode === 'demo'
              ? 'Otwórz zakładkę Klub i uruchom synchronizację grafiku.'
              : 'Trener dopiero przygotowuje grafik — zajrzyj tu później.'
          }
          action={<Button label="otwórz grafik" variant="secondary" onPress={() => router.push('/(tabs)/schedule')} />}
        />
      ) : null}

      {today.length === 0 && tomorrow.length === 0 && later.length === 0 && !sessionsQuery.isLoading ? (
        <Card tone="alt">
          <AppText variant="heading">{icons.calendarOff} Dziś bez maty</AppText>
          <AppText variant="muted">Nie masz zajęć w najbliższych dniach — zajrzyj do grafiku i zapisz się z wyprzedzeniem.</AppText>
        </Card>
      ) : null}

      <Card compact>
        <View style={styles.accountRow}>
          <View style={styles.accountText}>
            <AppText variant="label">{member ? `${member.firstName} ${member.lastName}` : 'Gość'}</AppText>
            <Badge
              label={member?.role === 'admin' ? 'admin' : member?.role === 'coach' ? 'trener' : 'członek'}
              tone={isStaff ? 'primary' : 'muted'}
            />
          </View>
          <Button
            label="wyloguj"
            icon={icons.logout}
            variant="ghost"
            small
            onPress={() => void signOut().then(() => router.replace('/login'))}
            testID="logout"
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  topText: { flex: 1, gap: 2 },
  checkInRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkInText: { flex: 1, gap: 2 },
  accountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  accountText: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
