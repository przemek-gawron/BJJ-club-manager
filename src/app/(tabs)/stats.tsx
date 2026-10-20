import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/BeltChip';
import { EmptyState, ErrorState, Screen, SectionHeader, TAB_SCREEN_EDGES } from '@/components/ui/Screen';
import { icons } from '@/components/ui/icons';
import { useAuth } from '@/state/AuthContext';
import { useClubStats, useMemberStats } from '@/hooks/queries';
import { CLASS_TYPE_LABEL_PL, LEVEL_LABEL_PL } from '@/domain/schedule';
import { consistencyLabel } from '@/domain/stats';
import { WEEKDAY_SHORT_PL } from '@/lib/poland-time';
import { colors, radius, spacing } from '@/theme/theme';

/** Zakładka „Moje” dla członka i „Frekwencja” dla trenera — ta sama trasa, różny zakres. */
export default function StatsScreen() {
  const { member, isStaff } = useAuth();
  const personal = useMemberStats(member?.id);
  const club = useClubStats();
  const [now] = useState(() => new Date());

  if (isStaff) return <ClubDashboard stats={club} now={now} />;

  const s = personal.data;
  return (
    <Screen refreshing={personal.isRefetching} onRefresh={() => void personal.refetch()} testID="personal-stats-screen" edges={TAB_SCREEN_EDGES}>
      <SectionHeader title="Moje treningi" subtitle={s ? consistencyLabel(s.weeklyAverage) : 'Liczymy twoją regularność'} icon={icons.stats} />

      {personal.isError ? (
        <ErrorState
          error={personal.error}
          hint="Statystyki liczy zapytanie po stronie serwera — ponów, gdy wróci sieć."
          onRetry={() => void personal.refetch()}
          testID="personal-stats-error"
        />
      ) : !s && !personal.isLoading ? (
        <EmptyState icon={icons.stats} title="Brak danych" message="Zamelduj się na zajęciach, a statystyki pojawią się tutaj." />
      ) : null}

      {s ? (
        <>
          <Card tone="primary">
            <View style={styles.metricRow}>
              <Metric value={s.weekStreak} label="tygodniowa passa" caption={`rekord: ${s.longestWeekStreak}`} />
              <Metric value={s.sessionsLast30Days} label="ostatnie 30 dni" caption={`średnio ${s.weeklyAverage.toFixed(1)}/tydz.`} />
            </View>
            <Progress value={s.currentMonthRatio} label="regularność w tym miesiącu" />
          </Card>

          <Card>
            <AppText variant="heading">{icons.flame} Rytm tygodnia</AppText>
            <BarChart data={s.byWeekday} max={Math.max(1, ...s.byWeekday.map(([, v]) => v))} />
            {s.byWeekday.length > 0 ? (
              <AppText variant="caption">
                {s.byWeekday[0] ? `Najczęściej trenujesz w dniu: ${WEEKDAY_SHORT_PL[s.byWeekday[0][0]] ?? '—'}` : ''}
              </AppText>
            ) : null}
          </Card>

          <Card>
            <AppText variant="heading">{icons.belt} Ulubione typy zajęć</AppText>
            {s.byClassType.length === 0 ? <AppText variant="muted">Historia jest pusta.</AppText> : null}
            {s.byClassType.slice(0, 5).map(([type, count]) => (
              <RowLine key={type} left={CLASS_TYPE_LABEL_PL[type] ?? type} right={`${count} ×`} />
            ))}
          </Card>

          <Card>
            <AppText variant="heading">{icons.clock} Historia meldunków</AppText>
            {s.history.length === 0 ? <AppText variant="muted">Brak meldunków.</AppText> : null}
            {s.history
              .slice(-8)
              .reverse()
              .map((record) => (
                <RowLine
                  key={record.id}
                  left={new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: 'short' }).format(new Date(record.checkedInAt))}
                  right={record.source === 'qr' ? 'QR' : 'trener'}
                  tone={record.outcome === 'no_show' ? 'danger' : 'success'}
                />
              ))}
            {s.noShows > 0 ? <AppText variant="caption">Nieobecności po zapisie: {s.noShows}. Odwołuj zapis, jeśli nie możesz przyjść.</AppText> : null}
          </Card>

          <Button label="pokaż mój profil" variant="secondary" onPress={() => member && router.push(`/member/${member.id}`)} testID="open-my-profile" />
        </>
      ) : null}
    </Screen>
  );
}

/** Panel trenera/admina: frekwencja klubu, ranking i osoby, które zniknęły. */
const ClubDashboard: React.FC<{ readonly stats: ReturnType<typeof useClubStats>; readonly now: Date }> = ({ stats, now }) => {
  const c = stats.data;
  return (
    <Screen refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()} testID="club-stats-screen" edges={TAB_SCREEN_EDGES}>
      <SectionHeader
        title="Frekwencja klubu"
        subtitle="Podsumowanie ostatnich 6 tygodni"
        icon={icons.stats}
        action={<Button label="klub" small variant="secondary" onPress={() => router.push('/admin')} testID="open-club-admin" />}
      />

      {stats.isError ? (
        <ErrorState
          error={stats.error}
          hint="Frekwencję liczy zapytanie klubowe — ponów, gdy wróci połączenie."
          onRetry={() => void stats.refetch()}
          testID="club-stats-error"
        />
      ) : !c && !stats.isLoading ? (
        <EmptyState icon={icons.stats} title="Brak danych frekwencji" message="Zakończ jedne zajęcia, żeby zobaczyć statystyki." />
      ) : null}

      {c ? (
        <>
          <Card tone="primary">
            <View style={styles.metricRow}>
              <Metric value={c.checkInsToday} label="meldunki dzisiaj" caption={`na ${c.activeMembers} aktywnych`} />
              <Metric value={c.averageAttendance} label="średnio na zajęciach" caption={`${c.sessionsHeld} przeprowadzonych`} />
            </View>
            <View style={styles.badgeRow}>
              <Badge label={`wypisywka ${100 - c.attendanceRate}%`} tone={c.attendanceRate >= 80 ? 'success' : 'warning'} />
              <Badge label={`obecność ${c.attendanceRate}%`} tone="success" />
              <Badge label={`${c.noShows} no-show`} tone={c.noShows > 5 ? 'warning' : 'muted'} />
            </View>
          </Card>

          <Card>
            <AppText variant="heading">{icons.calendar} Frekwencja wg dni tygodnia</AppText>
            <BarChart data={c.attendanceByWeekday} max={Math.max(1, ...c.attendanceByWeekday.map(([, v]) => v))} />
          </Card>

          <Card>
            <AppText variant="heading">{icons.clock} Frekwencja wg godzin</AppText>
            <BarChart data={c.attendanceByHour} max={Math.max(1, ...c.attendanceByHour.map(([, v]) => v))} hours />
          </Card>

          <Card>
            <AppText variant="heading">{icons.medal} Ranking ostatnich 30 dni</AppText>
            {c.leaderboard.length === 0 ? <AppText variant="muted">Nikt nie trenował w tym oknie.</AppText> : null}
            {c.leaderboard.map((row, index) => (
              <View key={row.member.id} style={styles.leaderRow}>
                <AppText variant="label" style={styles.rank}>
                  {index + 1}
                </AppText>
                <Avatar name={row.member.displayName} seed={row.member.avatarSeed} size={34} />
                <View style={styles.leaderText}>
                  <AppText variant="heading" numberOfLines={1}>
                    {row.member.displayName}
                  </AppText>
                  <AppText variant="caption">{row.member.weightBand}</AppText>
                </View>
                <View style={styles.leaderRight}>
                  <AppText variant="heading" color={colors.success}>
                    {row.sessions30Days}
                  </AppText>
                  {row.weekStreak > 1 ? <Badge label={`passa ${row.weekStreak}`} tone="warning" icon={icons.flame} /> : null}
                </View>
              </View>
            ))}
          </Card>

          <Card tone={c.inactiveMembers.length > 0 ? 'warning' : 'default'}>
            <AppText variant="heading">{icons.warning} Zniknęli z maty</AppText>
            {c.inactiveMembers.length === 0 ? <AppText variant="muted">Wszyscy aktywni trenowali w ciągu 14 dni.</AppText> : null}
            {c.inactiveMembers.map((row) => (
              <PressableRow
                key={row.member.id}
                title={row.member.displayName}
                subtitle={`${row.daysSinceLastTraining} dni bez treningu`}
                onPress={() => router.push(`/member/${row.member.id}`)}
              />
            ))}
          </Card>

          <Card>
            <AppText variant="heading">{icons.poll} Najczęściej przerabiane techniki</AppText>
            {c.mostCoveredTechniques.slice(0, 6).map(([name, count]) => (
              <RowLine key={name} left={name} right={`${count} ×`} />
            ))}
          </Card>

          <Card tone="alt" compact>
            <AppText variant="caption">
              {icons.info} Poziomy zajęć: {LEVEL_LABEL_PL.all}, {LEVEL_LABEL_PL.beginners}, {LEVEL_LABEL_PL.intermediate}, {LEVEL_LABEL_PL.advanced}.
            </AppText>
          </Card>
        </>
      ) : null}
      <AppText variant="caption">Stan na {now.toLocaleString('pl-PL')}</AppText>
    </Screen>
  );
};

/** Pojedyncza liczba w siatce metryk. */
const Metric: React.FC<{ readonly value: number; readonly label: string; readonly caption?: string }> = ({ value, label, caption }) => (
  <View style={styles.metric}>
    <AppText variant="metric">{value}</AppText>
    <AppText variant="label">{label}</AppText>
    {caption ? <AppText variant="caption">{caption}</AppText> : null}
  </View>
);

const Progress: React.FC<{ readonly value: number; readonly label: string }> = ({ value, label }) => (
  <View style={styles.progressWrap}>
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(2, value))}%` }]} />
    </View>
    <AppText variant="caption">
      {label}: {value}%
    </AppText>
  </View>
);

/** Wykres słupkowy bez zewnętrznych zależności: słupki skalowane do maksimum w zbiorze. */
const BarChart: React.FC<{ readonly data: ReadonlyArray<readonly [number, number]>; readonly max: number; readonly hours?: boolean }> = ({
  data,
  max,
  hours = false,
}) => {
  if (data.length === 0) return <AppText variant="muted">Brak danych.</AppText>;
  return (
    <View style={styles.chartRow}>
      {data.map(([key, value]) => (
        <View key={`${hours ? `h${key}` : `d${key}`}`} style={styles.chartCol}>
          <AppText variant="caption" align="center">
            {value}
          </AppText>
          <View style={styles.chartBarTrack}>
            <View style={[styles.chartBar, { height: `${Math.max(4, Math.round((value / max) * 100))}%` }]} />
          </View>
          <AppText variant="caption" align="center">
            {hours ? `${key}` : WEEKDAY_SHORT_PL[key] ?? `${key}`}
          </AppText>
        </View>
      ))}
    </View>
  );
};

const RowLine: React.FC<{ readonly left: string; readonly right: string; readonly tone?: 'success' | 'danger' | 'default' }> = ({
  left,
  right,
  tone = 'default',
}) => (
  <View style={styles.lineRow}>
    <AppText variant="body" style={styles.lineLeft} numberOfLines={1}>
      {left}
    </AppText>
    <AppText variant="label" color={tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.textMuted}>
      {right}
    </AppText>
  </View>
);

const PressableRow: React.FC<{ readonly title: string; readonly subtitle: string; readonly onPress: () => void }> = ({ title, subtitle, onPress }) => (
  <Button label={`${title} — ${subtitle}`} variant="secondary" small onPress={onPress} style={styles.pressRow} />
);

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', gap: spacing.lg },
  metric: { flex: 1, gap: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  progressWrap: { gap: spacing.xs },
  progressTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  chartCol: { flex: 1, gap: 2 },
  chartBarTrack: { height: 72, justifyContent: 'flex-end', alignItems: 'center' },
  chartBar: { width: 16, borderRadius: radius.sm, backgroundColor: colors.primary },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineLeft: { flex: 1 },
  leaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { width: 18, color: colors.textFaint },
  leaderText: { flex: 1, gap: 1 },
  leaderRight: { alignItems: 'flex-end', gap: 2 },
  pressRow: { alignSelf: 'stretch' },
});
