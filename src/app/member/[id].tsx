import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar, BeltChip } from '@/components/ui/BeltChip';
import { EmptyState, Screen, SectionHeader } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { icons } from '@/components/ui/icons';
import { useAssignBelt, useMember, useSetMembership, useUpdateMe } from '@/hooks/queries';
import { useAuth } from '@/state/AuthContext';
import { BELT_LABEL_PL, BELT_ORDER, MAX_STRIPE, beltLabel, validateBeltChange } from '@/domain/belts';
import { MEMBERSHIP_LABEL_PL, ROLE_LABEL_PL, tenureLabel } from '@/domain/members';
import { CLASS_TYPE_LABEL_PL } from '@/domain/schedule';
import { consistencyLabel } from '@/domain/stats';
import { formatWarsawDate, formatWarsawDateTime } from '@/lib/poland-time';
import { colors, radius, spacing } from '@/theme/theme';
import type { Belt, MembershipStatus, StripeCount } from '@/domain/types';

const MEMBERSHIP_STATUSES: ReadonlyArray<MembershipStatus> = ['active', 'suspended', 'none'];

/** Profil członka: publiczna karta dla każdego, narzędzia trenera dla kadry. */
export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { member: me, isStaff } = useAuth();
  const detailQuery = useMember(id);
  const assignBelt = useAssignBelt();
  const setMembership = useSetMembership();
  const updateMe = useUpdateMe();
  const [now] = useState(() => new Date());

  const [belt, setBelt] = useState<Belt | null>(null);
  const [stripe, setStripe] = useState<StripeCount>(0);
  const [note, setNote] = useState('');
  const [nickname, setNickname] = useState<string | null>(null);
  const [weight, setWeight] = useState<string | null>(null);

  const detail = detailQuery.data;
  const isMe = detail ? detail.member.id === me?.id : false;
  const canManage = isStaff && !isMe;

  const targetBelt: Belt = belt ?? detail?.member.belt ?? 'white';
  const preview = useMemo(
    () =>
      detail
        ? validateBeltChange({ belt: detail.member.belt, stripe: detail.member.stripe }, { belt: targetBelt, stripe })
        : { ok: false, message: '' },
    [detail, targetBelt, stripe]
  );

  const submitBelt = useCallback(() => {
    if (!detail) return;
    assignBelt.mutate(
      { memberId: detail.member.id, belt: targetBelt, stripe, note: note.trim().length > 0 ? note.trim() : null },
      {
        onSuccess: (result) => {
          if (result.ok) {
            setBelt(null);
            setStripe(0);
            setNote('');
          }
        },
      }
    );
  }, [detail, targetBelt, stripe, note, assignBelt]);

  if (!detail && !detailQuery.isLoading) {
    return (
      <Screen testID="member-missing">
        <EmptyState icon={icons.users} title="Brak takiego profilu" message="Osoba mogła opuścić klub albo link jest nieaktualny." />
        <Button label="wróć do katalogu" variant="secondary" onPress={() => router.replace('/(tabs)/members')} />
      </Screen>
    );
  }

  if (!detail) {
    return (
      <Screen testID="member-loading">
        <Card>
          <AppText variant="muted">Wczytujemy profil…</AppText>
        </Card>
      </Screen>
    );
  }

  const { member, stats, beltHistory } = detail;
  const statsMessage = assignBelt.data ?? setMembership.data ?? updateMe.data;

  return (
    <Screen refreshing={detailQuery.isRefetching} onRefresh={() => void detailQuery.refetch()} testID="member-detail">
      <Card tone={member.membership === 'active' ? 'default' : 'warning'}>
        <View style={styles.head}>
          <Avatar name={`${member.firstName} ${member.lastName}`} seed={member.avatarSeed} size={56} />
          <View style={styles.headText}>
            <AppText variant="title">{member.nickname?.trim() ? `${member.firstName} „${member.nickname}”` : `${member.firstName} ${member.lastName}`}</AppText>
            <AppText variant="muted">
              {ROLE_LABEL_PL[member.role]} · staż {tenureLabel(member.joinedAt, now)}
            </AppText>
            <BeltChip belt={member.belt} stripe={member.stripe} />
          </View>
        </View>
        <View style={styles.chipRow}>
          <Badge label={`członkostwo: ${MEMBERSHIP_LABEL_PL[member.membership]}`} tone={member.membership === 'active' ? 'success' : 'warning'} />
          <Badge label={`w klubie od ${formatWarsawDate(member.joinedAt)}`} tone="muted" />
          {isMe && member.email ? <Badge label={member.email} tone="muted" /> : null}
          {isMe && member.phone ? <Badge label={member.phone} tone="muted" /> : null}
          {isStaff && member.weightKg != null ? <Badge label={`${member.weightKg} kg`} tone="primary" /> : null}
          {!isStaff ? <Badge label={stats ? 'masa: przedział 10 kg' : '—'} tone="muted" /> : null}
        </View>
        {member.notes && isStaff ? <AppText variant="muted">Notatka trenera: {member.notes}</AppText> : null}
      </Card>

      {statsMessage && !statsMessage.ok ? (
        <Card tone="danger">
          <AppText variant="body">{statsMessage.message}</AppText>
        </Card>
      ) : null}

      <SectionHeader title="Twoja regularność" subtitle={consistencyLabel(stats.weeklyAverage)} icon={icons.stats} />
      <Card tone="primary">
        <View style={styles.metricRow}>
          <Metric value={stats.weekStreak} label="passa tygodniowa" caption={`rekord ${stats.longestWeekStreak}`} />
          <Metric value={stats.totalSessions} label="trenigów łącznie" caption={`${stats.sessionsLast30Days} w 30 dni`} />
        </View>
        {stats.byClassType.length > 0 ? (
          <View style={styles.chipRow}>
            {stats.byClassType.slice(0, 4).map(([type, count]) => (
              <Badge key={type} label={`${CLASS_TYPE_LABEL_PL[type]} ${count}×`} tone="muted" />
            ))}
          </View>
        ) : null}
        <AppText variant="caption">
          {stats.firstTrainingAt ? `Pierwszy trening: ${formatWarsawDate(stats.firstTrainingAt)}` : 'Brak historii treningów'}
          {stats.lastTrainingAt ? ` · ostatnio: ${formatWarsawDate(stats.lastTrainingAt)}` : ''}
        </AppText>
        {isStaff && stats.noShows > 0 ? <AppText variant="caption">Nieobecności po zapisie: {stats.noShows}</AppText> : null}
      </Card>

      <SectionHeader title="Historia pasków" subtitle={`${beltHistory.length} wpisów`} icon={icons.belt} />
      {beltHistory.length === 0 ? <EmptyState icon={icons.belt} title="Brak wpisów" message="Pierwszy pasek nadaje trener w tym widoku." /> : null}
      {beltHistory.map((entry, index) => (
        <Card key={entry.id} compact tone={index === 0 ? 'success' : 'default'}>
          <View style={styles.historyRow}>
            <BeltChip belt={entry.belt} stripe={entry.stripe} />
            <AppText variant="caption">{formatWarsawDateTime(entry.assignedAt)}</AppText>
          </View>
          {entry.note ? <AppText variant="muted">{entry.note}</AppText> : null}
        </Card>
      ))}

      {canManage ? (
        <>
          <SectionHeader title="Nadaj pasek" subtitle="kreski 0–4, awans o jeden stopień" icon={icons.medal} />
          <Card>
            <AppText variant="label">Nowy poziom</AppText>
            <View style={styles.chipRow}>
              {BELT_ORDER.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => {
                    setBelt(option);
                    setStripe(0);
                  }}
                  testID={`belt-option-${option}`}
                  style={[styles.chip, targetBelt === option && styles.chipActive]}
                >
                  <AppText variant="label" color={targetBelt === option ? colors.text : colors.textMuted}>
                    {BELT_LABEL_PL[option]}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <AppText variant="label">Kreski</AppText>
            <View style={styles.chipRow}>
              {([0, 1, 2, 3, 4] as const).map((count) => (
                <Pressable
                  key={count}
                  accessibilityRole="button"
                  onPress={() => setStripe(count as StripeCount)}
                  testID={`stripe-${count}`}
                  disabled={targetBelt === 'white' && count === 0 ? false : undefined}
                  style={[styles.chip, stripe === count && styles.chipActive]}
                >
                  <AppText variant="label" color={stripe === count ? colors.text : colors.textMuted}>
                    {count === 0 ? 'bez kresek' : `${count} ${count === 1 ? 'kreska' : 'kreski'}`}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <TextField
              label="Notatka (widoczna w historii)"
              placeholder="np. świetna garda, awans po 6 miesiącach"
              value={note}
              onChangeText={setNote}
              multiline
              testID="belt-note"
            />
            <AppText variant="caption">
              {preview.ok ? `Zapiszemy: ${beltLabel(targetBelt, stripe)}` : preview.message || `Wybierz poziom wyższy niż ${beltLabel(member.belt, member.stripe)}.`}
            </AppText>
            <Button
              label="zapisz pasek"
              disabled={!preview.ok}
              loading={assignBelt.isPending}
              onPress={submitBelt}
              testID="assign-belt"
            />
            <AppText variant="caption">Limit kresek: {MAX_STRIPE}. Awans podnosi tylko jeden stopień paska.</AppText>
          </Card>

          <SectionHeader title="Członkostwo" subtitle="status decyduje o zapisach i check-inie" icon={icons.settings} />
          <Card tone={member.membership === 'active' ? 'success' : 'warning'}>
            <View style={styles.chipRow}>
              {MEMBERSHIP_STATUSES.map((status) => (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  onPress={() => setMembership.mutate({ memberId: member.id, status })}
                  testID={`membership-${status}`}
                  style={[styles.chip, member.membership === status && styles.chipActive]}
                >
                  <AppText variant="label" color={member.membership === status ? colors.text : colors.textMuted}>
                    {MEMBERSHIP_LABEL_PL[status]}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <AppText variant="caption">Zawieszenie blokuje zapisy, głosowania i meldunki QR.</AppText>
          </Card>
        </>
      ) : null}

      {isMe ? (
        <Card tone="alt">
          <AppText variant="heading">{icons.note} Twój pseudonim i masa</AppText>
          <AppText variant="muted">Pseudonim widziany w katalogu i tablicy sparów. Dokładna masa jest tylko dla trenerów.</AppText>
          <TextField
            label="Pseudonim"
            placeholder="np. Guma"
            value={nickname ?? member.nickname ?? ''}
            onChangeText={setNickname}
            autoCapitalize="words"
            testID="my-nickname"
          />
          <TextField
            label="Masa (kg)"
            placeholder="np. 78"
            keyboardType="numeric"
            value={weight ?? (member.weightKg != null ? String(member.weightKg) : '')}
            onChangeText={setWeight}
            testID="my-weight"
          />
          <Button
            label="zapisz zmiany"
            loading={updateMe.isPending}
            onPress={() =>
              updateMe.mutate({
                nickname: (nickname ?? '').trim().length > 0 ? (nickname ?? '').trim() : null,
                weightKg: weight != null && weight.trim().length > 0 ? Number(weight.replace(',', '.')) : null,
              })
            }
            testID="save-me"
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const Metric: React.FC<{ readonly value: number; readonly label: string; readonly caption?: string }> = ({ value, label, caption }) => (
  <View style={styles.metric}>
    <AppText variant="metric">{value}</AppText>
    <AppText variant="label">{label}</AppText>
    {caption ? <AppText variant="caption">{caption}</AppText> : null}
  </View>
);

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headText: { flex: 1, gap: 3 },
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
  metricRow: { flexDirection: 'row', gap: spacing.lg },
  metric: { flex: 1, gap: 2 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
