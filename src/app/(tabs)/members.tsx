import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar, BeltChip } from '@/components/ui/BeltChip';
import { EmptyState, ErrorState, Screen, SectionHeader, TAB_SCREEN_EDGES } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { icons } from '@/components/ui/icons';
import { useMembers } from '@/hooks/queries';
import { useAuth } from '@/state/AuthContext';
import { BELT_LABEL_PL, BELT_ORDER } from '@/domain/belts';
import { ROLE_LABEL_PL } from '@/domain/members';
import { daysSinceLastTraining } from '@/domain/stats';
import { formatWarsawDate, warsawDayKey } from '@/lib/poland-time';
import { colors, radius, spacing } from '@/theme/theme';
import type { Belt, PublicMemberCard } from '@/domain/types';

type SortKey = 'name' | 'belt' | 'recent';

const SORT_LABEL: Record<SortKey, string> = {
  name: 'alfabetycznie',
  belt: 'wg paska',
  recent: 'ostatnio na macie',
};

/** Katalog klubu: publiczny widok dla członka, punkt wejścia do zarządzania dla trenera. */
export default function MembersScreen() {
  const { isStaff } = useAuth();
  const membersQuery = useMembers();
  const [now] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [beltFilter, setBeltFilter] = useState<Belt | null>(null);

  const members = membersQuery.data ?? [];

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = members
      .filter((m) => (beltFilter ? m.belt === beltFilter : true))
      .filter((m) => (needle ? m.displayName.toLowerCase().includes(needle) : true));
    if (sort === 'belt') {
      sorted.sort((a, b) => BELT_ORDER.indexOf(b.belt) - BELT_ORDER.indexOf(a.belt) || a.displayName.localeCompare(b.displayName, 'pl'));
    } else if (sort === 'recent') {
      sorted.sort((a, b) => (b.lastTrainingAt ?? '').localeCompare(a.lastTrainingAt ?? ''));
    } else {
      sorted.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pl'));
    }
    return sorted;
  }, [members, query, sort, beltFilter]);

  return (
    <Screen refreshing={membersQuery.isRefetching} onRefresh={() => void membersQuery.refetch()} testID="members-screen" edges={TAB_SCREEN_EDGES}>
      <SectionHeader
        title={isStaff ? 'Klub' : 'Ludzie'}
        subtitle={`${members.length} ${members.length === 1 ? 'osoba' : 'osób'} w klubie`}
        icon={icons.users}
        action={isStaff ? <Button label="dodaj" small icon={icons.plus} onPress={() => router.push('/admin')} testID="add-member" /> : undefined}
      />

      <TextField
        label="Szukaj"
        placeholder="imię lub ksywa"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
        testID="member-search"
      />

      <View style={styles.chipRow}>
        {(['name', 'belt', 'recent'] as const).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={() => setSort(key)}
            testID={`sort-${key}`}
            style={[styles.chip, sort === key && styles.chipActive]}
          >
            <AppText variant="label" color={sort === key ? colors.text : colors.textMuted}>
              {SORT_LABEL[key]}
            </AppText>
          </Pressable>
        ))}
      </View>

      <BeltFilters selected={beltFilter} onPick={setBeltFilter} />

      {membersQuery.isError ? (
        <ErrorState
          error={membersQuery.error}
          hint="Katalog klubu pobieramy z serwera — ponów, gdy wróci połączenie."
          onRetry={() => void membersQuery.refetch()}
          testID="members-error"
        />
      ) : visible.length === 0 && !membersQuery.isLoading ? (
        <EmptyState icon={icons.users} title="Nikt nie pasuje" message="Zmień frazę wyszukiwania lub filtr paska." />
      ) : null}

      {visible.map((member) => (
        <MemberRow key={member.id} member={member} now={now} onPress={() => router.push(`/member/${member.id}`)} />
      ))}

      <Card tone="alt" compact>
        <AppText variant="caption">
          {icons.info} Katalog chroni prywatność: pokazujemy ksywę (lub imię) oraz masa w przedziale co 10 kg. Telefon, e-mail i dokładna waga są widoczne tylko dla trenerów.
        </AppText>
      </Card>
    </Screen>
  );
}

/** Filtr po paskach: „wszystkie paski” + pięć poziomów. */
const BeltFilters: React.FC<{ readonly selected: Belt | null; readonly onPick: (belt: Belt | null) => void }> = ({ selected, onPick }) => (
  <View style={styles.chipRow}>
    <Pressable accessibilityRole="button" onPress={() => onPick(null)} testID="belt-all" style={[styles.chip, selected === null && styles.chipActive]}>
      <AppText variant="label" color={selected === null ? colors.text : colors.textMuted}>
        wszystkie paski
      </AppText>
    </Pressable>
    {BELT_ORDER.map((belt) => (
      <Pressable
        key={belt}
        accessibilityRole="button"
        onPress={() => onPick(belt)}
        testID={`belt-${belt}`}
        style={[styles.chip, selected === belt && styles.chipActive]}
      >
        <AppText variant="label" color={selected === belt ? colors.text : colors.textMuted}>
          {BELT_LABEL_PL[belt]}
        </AppText>
      </Pressable>
    ))}
  </View>
);

const lastSeenLabel = (member: PublicMemberCard, now: Date): string => {
  if (!member.lastTrainingAt) return 'brak treningów';
  if (warsawDayKey(member.lastTrainingAt) === warsawDayKey(now)) return 'mata dziś';
  return `mata ${formatWarsawDate(member.lastTrainingAt)}`;
};

const MemberRow: React.FC<{ readonly member: PublicMemberCard; readonly now: Date; readonly onPress: () => void }> = React.memo(
  ({ member, now, onPress }) => {
    const gap = daysSinceLastTraining(member.lastTrainingAt, now);
    const stale = gap != null && gap >= 14;
    return (
      <Pressable accessibilityRole="button" onPress={onPress} testID={`member-row-${member.id}`} style={({ pressed }) => [pressed && styles.pressed]}>
        <Card tone={stale ? 'warning' : 'default'} compact>
          <View style={styles.row}>
            <Avatar name={member.displayName} seed={member.avatarSeed} />
            <View style={styles.rowText}>
              <AppText variant="heading" numberOfLines={1}>
                {member.displayName}
              </AppText>
              <BeltChip belt={member.belt} stripe={member.stripe} />
              <AppText variant="caption">{member.weightBand}</AppText>
            </View>
            <View style={styles.rowRight}>
              {member.role !== 'member' ? <Badge label={ROLE_LABEL_PL[member.role]} tone="primary" /> : null}
              <Badge
                label={lastSeenLabel(member, now)}
                tone={stale ? 'warning' : member.lastTrainingAt ? 'muted' : 'danger'}
                icon={stale ? icons.warning : undefined}
              />
            </View>
          </View>
        </Card>
      </Pressable>
    );
  }
);
MemberRow.displayName = 'MemberRow';

const styles = StyleSheet.create({
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: spacing.xs },
  pressed: { opacity: 0.85 },
});
