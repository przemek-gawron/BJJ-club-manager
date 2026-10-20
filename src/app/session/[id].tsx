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
import { PollCard } from '@/components/PollCard';
import { SESSION_STATUS_LABEL } from '@/components/SessionCard';
import {
  useCancelSession,
  useCloseSession,
  useDecidePoll,
  useJoinSession,
  useLeaveSession,
  useMarkAttendance,
  usePoll,
  usePollSuggestion,
  usePublishPoll,
  useSession,
  useTechniques,
  useVote,
} from '@/hooks/queries';
import { useAuth } from '@/state/AuthContext';
import { CANCELLATION_REASONS, canManageSignup } from '@/domain/schedule';
import { MAX_POLL_OPTIONS, pollClosesLabel } from '@/domain/polls';
import { formatWarsawTime, relativeDayLabel } from '@/lib/poland-time';
import { colors, radius, spacing } from '@/theme/theme';
import type { RosterRow } from '@/data/api';

/** Szczegóły jednych zajęć: zapisy, rezerwa, frekwencja, ankieta i decyzje trenera. */
export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { member, isStaff } = useAuth();
  const sessionQuery = useSession(id);
  const pollQuery = usePoll(id);
  const [now] = useState(() => new Date());

  const join = useJoinSession();
  const leave = useLeaveSession();
  const mark = useMarkAttendance();
  const cancel = useCancelSession();
  const close = useCloseSession();
  const vote = useVote();
  const suggest = usePollSuggestion();
  const publish = usePublishPoll();
  const decide = useDecidePoll();

  const detail = sessionQuery.data;
  const session = detail?.session ?? null;
  const started = session ? new Date(session.startsAt).getTime() <= now.getTime() : false;
  const signupGate = session ? canManageSignup(session, now) : { ok: false, message: '' };

  const [cancelReason, setCancelReason] = useState<string>(CANCELLATION_REASONS[0] ?? 'Inne');
  const [suggestion, setSuggestion] = useState('');
  const [draftOptions, setDraftOptions] = useState<ReadonlyArray<string>>([]);

  const techniques = useTechniques();
  const techniqueNames = useMemo(() => (techniques.data ?? []).slice(0, 12), [techniques.data]);

  const message = join.data ?? leave.data ?? mark.data ?? cancel.data ?? close.data ?? publish.data ?? decide.data ?? vote.data ?? suggest.data;

  const toggleSignup = useCallback(() => {
    if (!session) return;
    if (session.isSignedUp || session.isWaitlisted) leave.mutate({ sessionId: session.id });
    else join.mutate({ sessionId: session.id });
  }, [session, join, leave]);

  if (!session && !sessionQuery.isLoading) {
    return (
      <Screen testID="session-missing">
        <EmptyState icon={icons.calendarOff} title="Nie znaleziono zajęć" message="Sesja mogła zostać usunięta lub zmienione zostało okno grafiku." />
        <Button label="wróć do grafiku" variant="secondary" onPress={() => router.replace('/(tabs)/schedule')} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen testID="session-loading">
        <Card>
          <AppText variant="muted">Wczytujemy szczegóły zajęć…</AppText>
        </Card>
      </Screen>
    );
  }

  const status = SESSION_STATUS_LABEL[session.status] ?? SESSION_STATUS_LABEL.scheduled!;
  const capacity = session.capacityOverride ?? session.classTemplate.capacity;

  return (
    <Screen refreshing={sessionQuery.isRefetching || pollQuery.isRefetching} onRefresh={() => void sessionQuery.refetch()} testID="session-detail">
      <Card tone={session.status === 'cancelled' ? 'danger' : 'default'}>
        <View style={styles.head}>
          <View style={[styles.colorBar, { backgroundColor: session.classTemplate.color }]} />
          <View style={styles.headText}>
            <AppText variant="title">{session.classTemplate.name}</AppText>
            <AppText variant="muted">
              {relativeDayLabel(new Date(session.startsAt), now)} · {formatWarsawTime(new Date(session.startsAt))}–
              {formatWarsawTime(new Date(session.endsAt))}
            </AppText>
          </View>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <View style={styles.chipRow}>
          <Badge label={`prowadzi ${session.coachName}`} tone="muted" />
          <Badge
            label={capacity == null ? 'bez limitu miejsc' : `${session.signupCount}/${capacity} miejsc`}
            tone={capacity != null && session.signupCount >= capacity ? 'warning' : 'muted'}
          />
          {session.waitlistCount > 0 ? <Badge label={`rezerwa: ${session.waitlistCount}`} tone="warning" /> : null}
          <Badge label={`obecnych: ${session.attendanceCount}`} tone={session.attendanceCount > 0 ? 'success' : 'muted'} />
        </View>
        {session.classTemplate.description ? <AppText variant="muted">{session.classTemplate.description}</AppText> : null}
        {session.status === 'cancelled' && session.cancelledReason ? (
          <AppText variant="muted">Powód odwołania: {session.cancelledReason}</AppText>
        ) : null}
        <AppText variant="caption">{session.classTemplate.startTime} · {session.classTemplate.durationMinutes} min · szablon: {session.classTemplate.id}</AppText>
      </Card>

      {message && !message.ok ? <Card tone="danger"><AppText variant="body">{message.message}</AppText></Card> : null}

      {session.status === 'scheduled' ? (
        <View style={styles.actions}>
          {session.isSignedUp || session.isWaitlisted ? (
            <Button
              label={session.isWaitlisted ? `rezygnuj (rezerwa #${session.myWaitlistPosition ?? '?'})` : 'rezygnuj z miejsca'}
              variant="danger"
              style={styles.action}
              disabled={!signupGate.ok}
              loading={leave.isPending}
              onPress={toggleSignup}
              testID="leave-session"
            />
          ) : (
            <Button
              label="zapisz się"
              style={styles.action}
              disabled={!signupGate.ok}
              loading={join.isPending}
              onPress={toggleSignup}
              testID="join-session"
            />
          )}
          <Button label="check-in" variant="secondary" icon={icons.scan} onPress={() => router.push({ pathname: '/check-in', params: { sessionId: session.id } })} testID="session-check-in" />
        </View>
      ) : null}
      {!signupGate.ok && session.status === 'scheduled' ? <AppText variant="caption">{signupGate.message}</AppText> : null}
      {session.isWaitlisted ? (
        <Card tone="warning" compact>
          <AppText variant="muted">
            Jesteś w rezerwie na pozycji {session.myWaitlistPosition}. Gdy ktoś zrezygnuje, miejsce zwalnia się automatycznie i dostaniesz miejsce.
          </AppText>
        </Card>
      ) : null}

      {pollQuery.data ? (
        <>
          <SectionHeader title="Ankieta" subtitle={`głosowanie ${pollClosesLabel(pollQuery.data.closesAt, now)}`} icon={icons.poll} />
          <PollCard
            summary={pollQuery.data}
            now={now}
            pendingOptionId={vote.isPending ? vote.variables?.optionId ?? null : null}
            onVote={(optionId) => vote.mutate({ pollId: pollQuery.data!.poll.id, optionId })}
          />
          {pollQuery.data.canSuggest ? (
            <Card compact>
              <TextField
                label="Twoja propozycja"
                placeholder="np. balacha z gardy"
                value={suggestion}
                onChangeText={setSuggestion}
                onSubmitEditing={() => {
                  if (suggestion.trim().length > 1) suggest.mutate({ pollId: pollQuery.data!.poll.id, label: suggestion.trim() }, { onSuccess: () => setSuggestion('') });
                }}
                returnKeyType="done"
                testID="poll-suggestion"
              />
              <Button
                label="dodaj propozycję"
                small
                variant="secondary"
                loading={suggest.isPending}
                onPress={() =>
                  suggestion.trim().length > 1 &&
                  suggest.mutate({ pollId: pollQuery.data!.poll.id, label: suggestion.trim() }, { onSuccess: () => setSuggestion('') })
                }
                testID="submit-suggestion"
              />
            </Card>
          ) : null}
          {pollQuery.data.isCoachView && pollQuery.data.status !== 'open' ? (
            <Card tone="alt">
              <AppText variant="heading">{icons.crown} Decyzja trenera</AppText>
              <AppText variant="muted">Możesz potwierdzić wynik lub wskazać inny temat — członkowie zobaczą twoją decyzję.</AppText>
              {pollQuery.data.options.map((row) => (
                <Button
                  key={row.option.id}
                  label={`wybierz: ${row.option.label}`}
                  variant={row.isWinner ? 'success' : 'secondary'}
                  small
                  loading={decide.isPending && decide.variables?.optionId === row.option.id}
                  onPress={() => decide.mutate({ pollId: pollQuery.data!.poll.id, optionId: row.option.id })}
                  style={styles.fullWidth}
                  testID={`decide-${row.option.id}`}
                />
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {isStaff && !pollQuery.data && session.status === 'scheduled' ? (
        <PollComposer
          draft={draftOptions}
          onDraftChange={setDraftOptions}
          suggestions={techniqueNames.map((t) => t.name)}
          pending={publish.isPending}
          onPublish={(labels) =>
            publish.mutate(
              {
                sessionId: session.id,
                labels,
                techniqueIds: labels.map((label) => techniqueNames.find((t) => t.name === label)?.id ?? null),
              },
              { onSuccess: () => setDraftOptions([]) }
            )
          }
        />
      ) : null}

      <SectionHeader
        title="Lista obecności"
        subtitle={`zapisanych ${detail?.roster.length ?? 0} · wolnych wejść ${detail?.walkIns.length ?? 0}`}
        icon={icons.users}
      />
      {detail && detail.roster.length === 0 && detail.walkIns.length === 0 ? (
        <EmptyState icon={icons.users} title="Nikt nie zapisany" message="Zapisy zamykają się w momencie startu zajęć." />
      ) : null}
      {detail?.roster.map((row) => (
        <RosterEntry
          key={`${row.memberId}-${row.status}`}
          row={row}
          isStaff={isStaff}
          busy={mark.isPending && mark.variables?.memberId === row.memberId}
          onToggle={(present) => mark.mutate({ sessionId: session.id, memberId: row.memberId, present })}
          onOpen={() => router.push(`/member/${row.memberId}`)}
        />
      ))}
      {detail && detail.walkIns.length > 0 ? (
        <Card compact>
          <AppText variant="label">Wejścia bez zapisu</AppText>
          {detail.walkIns.map((row) => (
            <RosterEntry
              key={`walkin-${row.memberId}`}
              row={row}
              isStaff={isStaff}
              busy={mark.isPending && mark.variables?.memberId === row.memberId}
              onToggle={(present) => mark.mutate({ sessionId: session.id, memberId: row.memberId, present })}
              onOpen={() => router.push(`/member/${row.memberId}`)}
            />
          ))}
        </Card>
      ) : null}

      {isStaff && session.status === 'scheduled' ? (
        <Card tone="warning">
          <AppText variant="heading">{icons.calendarOff} Odwołanie zajęć</AppText>
          <AppText variant="muted">Miejsca z rezerwy nie przechodzą — informujemy klub o przyczynie odwołania.</AppText>
          <View style={styles.chipRow}>
            {CANCELLATION_REASONS.map((reason) => (
              <Pressable key={reason} accessibilityRole="button" onPress={() => setCancelReason(reason)} style={[styles.chip, cancelReason === reason && styles.chipActive]}>
                <AppText variant="label" color={cancelReason === reason ? colors.text : colors.textMuted}>
                  {reason}
                </AppText>
              </Pressable>
            ))}
          </View>
          <Button
            label={`odwołaj: ${cancelReason}`}
            variant="danger"
            loading={cancel.isPending}
            onPress={() => cancel.mutate({ sessionId: session.id, reason: cancelReason }, { onSuccess: () => router.back() })}
            testID="cancel-session"
          />
        </Card>
      ) : null}

      {isStaff && session.status !== 'finished' && started ? (
        <Card tone="alt">
          <AppText variant="heading">{icons.check} Zamknij zajęcia</AppText>
          <AppText variant="muted">
            Zamknięcie rozlicza frekwencję: zapisani bez meldunku dostają no-show, a statystyki klubu się aktualizują.
          </AppText>
          <Button label="zamknij zajęcia" loading={close.isPending} onPress={() => close.mutate({ sessionId: session.id })} testID="close-session" />
        </Card>
      ) : null}

      {member && session.isCheckedIn ? (
        <Card tone="success" compact>
          <AppText variant="body">{icons.check} Jesteś na liście obecności — miłego treningu.</AppText>
        </Card>
      ) : null}
    </Screen>
  );
}

/** Kreator ankiety dla trenera: lista propozycji + biblioteka technik. */
const PollComposer: React.FC<{
  readonly draft: ReadonlyArray<string>;
  readonly onDraftChange: (draft: ReadonlyArray<string>) => void;
  readonly suggestions: ReadonlyArray<string>;
  readonly pending: boolean;
  readonly onPublish: (labels: ReadonlyArray<string>) => void;
}> = ({ draft, onDraftChange, suggestions, pending, onPublish }) => {
  const [input, setInput] = useState('');

  const add = useCallback(
    (label: string) => {
      const clean = label.trim();
      if (clean.length < 2 || draft.includes(clean) || draft.length >= MAX_POLL_OPTIONS) return;
      onDraftChange([...draft, clean]);
      setInput('');
    },
    [draft, onDraftChange]
  );

  return (
    <Card>
      <AppText variant="heading">{icons.poll} Ankieta o temat zajęć</AppText>
      <AppText variant="muted">Dodaj 2–{MAX_POLL_OPTIONS} propozycje. Głosowanie zamyka się 30 minut przed startem.</AppText>
      <TextField
        label="Własna propozycja"
        placeholder="np. przechodzenie gardy pajacyka"
        value={input}
        onChangeText={setInput}
        onSubmitEditing={() => add(input)}
        returnKeyType="done"
        testID="poll-draft-input"
      />
      {draft.length > 0 ? (
        <View style={styles.chipRow}>
          {draft.map((label) => (
            <Pressable key={label} accessibilityRole="button" onPress={() => onDraftChange(draft.filter((d) => d !== label))} style={[styles.chip, styles.chipActive]}>
              <AppText variant="label">{icons.close} {label}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      <AppText variant="label">Biblioteka technik</AppText>
      <View style={styles.chipRow}>
        {suggestions.map((name) => (
          <Pressable
            key={name}
            accessibilityRole="button"
            onPress={() => add(name)}
            testID={`technique-${name.replace(/\s+/g, '-')}`}
            style={[styles.chip, draft.includes(name) && styles.chipActive]}
          >
            <AppText variant="label" color={draft.includes(name) ? colors.text : colors.textMuted}>
              {name}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Button
        label={`opublikuj ankietę (${draft.length})`}
        disabled={draft.length < 2}
        loading={pending}
        onPress={() => onPublish(draft)}
        testID="publish-poll"
      />
    </Card>
  );
};

/** Wiersz listy: status zapisu + przełącznik obecności dla trenera. */
const RosterEntry: React.FC<{
  readonly row: RosterRow;
  readonly isStaff: boolean;
  readonly busy: boolean;
  readonly onToggle: (present: boolean) => void;
  readonly onOpen: () => void;
}> = React.memo(({ row, isStaff, busy, onToggle, onOpen }) => {
  const present = row.checkedInAt != null;
  return (
    <Card compact>
      <View style={styles.rosterRow}>
        <Pressable accessibilityRole="button" onPress={onOpen} style={styles.rosterText} testID={`roster-${row.memberId}`}>
          <View style={styles.rosterHead}>
            <Avatar name={row.displayName} seed={row.memberId} size={34} />
            <View style={styles.rosterMeta}>
              <AppText variant="heading" numberOfLines={1}>
                {row.displayName}
              </AppText>
              <BeltChip belt={row.belt} stripe={row.stripe} />
            </View>
          </View>
        </Pressable>
        <View style={styles.rosterRight}>
          <Badge
            label={
              row.status === 'active'
                ? 'miejsce'
                : row.status === 'waitlist'
                  ? `rezerwa #${row.waitlistPosition ?? '?'}`
                  : 'rezygnacja'
            }
            tone={row.status === 'active' ? 'success' : row.status === 'waitlist' ? 'warning' : 'muted'}
          />
          {row.isWalkIn ? <Badge label="bez zapisu" tone="primary" /> : null}
          {present ? <Badge label={row.source === 'qr' ? 'QR' : 'trener'} tone="success" icon={icons.check} /> : null}
          {isStaff ? (
            <Button
              label={present ? 'wykreśl' : 'wpisz'}
              variant={present ? 'ghost' : 'secondary'}
              small
              loading={busy}
              onPress={() => onToggle(!present)}
              testID={`attendance-${row.memberId}`}
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
});
RosterEntry.displayName = 'RosterEntry';

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  colorBar: { width: 5, height: 40, borderRadius: radius.sm },
  headText: { flex: 1, gap: 2 },
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
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  action: { flex: 1, minWidth: 150 },
  fullWidth: { alignSelf: 'stretch' },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rosterText: { flex: 1 },
  rosterHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rosterMeta: { flex: 1, gap: 1 },
  rosterRight: { alignItems: 'flex-end', gap: spacing.xs },
});
