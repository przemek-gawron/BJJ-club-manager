/**
 * Hooki TanStack Query.
 *
 * Klucze są jawne i hierarchiczne, dzięki temu mutacje unieważniają dokładnie to,
 * co trzeba (np. zapis odświeża listę sesji i statystyki klubu, ale nie profile).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/data/api-client';
import { addWarsawDays, startOfWarsawDay } from '@/lib/poland-time';
import type { ActionResult, NewMemberInput, SparringIntentInput } from '@/data/api';

export const queryKeys = {
  me: ['me'] as const,
  clubName: ['club', 'name'] as const,
  sessions: (from: string, to: string) => ['sessions', from, to] as const,
  session: (id: string) => ['session', id] as const,
  templates: ['templates'] as const,
  members: ['members'] as const,
  member: (id: string) => ['member', id] as const,
  poll: (sessionId: string) => ['poll', sessionId] as const,
  techniques: ['techniques'] as const,
  sparring: (sessionId: string) => ['sparring', sessionId] as const,
  stats: (memberId: string) => ['stats', memberId] as const,
  clubStats: ['club', 'stats'] as const,
  todaysAttendance: ['attendance', 'today'] as const,
};

/** Okno sesji: 3 tygodnie wstecz (historia) i 3 tygodnie naprzód (grafik). */
export function sessionWindow(now = new Date()) {
  const from = addWarsawDays(startOfWarsawDay(now), -21);
  const to = addWarsawDays(startOfWarsawDay(now), 21);
  return { from, to };
}

export function useSessions() {
  const { from, to } = sessionWindow();
  return useQuery({
    queryKey: queryKeys.sessions(from.toISOString(), to.toISOString()),
    queryFn: () => api.sessionsWithClass(from, to),
    refetchOnWindowFocus: true,
  });
}

export function useSession(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.session(id ?? ''),
    queryFn: () => (id ? api.sessionDetail(id) : null),
    enabled: Boolean(id),
  });
}

export function useTemplates() {
  return useQuery({ queryKey: queryKeys.templates, queryFn: () => api.listTemplates() });
}

export function useMembers() {
  return useQuery({ queryKey: queryKeys.members, queryFn: () => api.listMembers() });
}

export function useMember(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.member(id ?? ''),
    queryFn: () => (id ? api.memberDetail(id) : null),
    enabled: Boolean(id),
  });
}

export function usePoll(sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.poll(sessionId ?? ''),
    queryFn: () => (sessionId ? api.pollSummary(sessionId) : null),
    enabled: Boolean(sessionId),
    // Ankieta żyje — liczniki głosów odświeżamy co kilka sekund, dopóki jest otwarta.
    refetchInterval: (query) => (query.state.data?.status === 'open' ? 5_000 : false),
  });
}

export function useTechniques() {
  return useQuery({ queryKey: queryKeys.techniques, queryFn: () => api.techniques() });
}

export function useSparringBoard(sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sparring(sessionId ?? ''),
    queryFn: () => (sessionId ? api.sparringBoard(sessionId) : []),
    enabled: Boolean(sessionId),
  });
}

export function useMemberStats(memberId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.stats(memberId ?? ''),
    queryFn: () => (memberId ? api.memberStats(memberId) : null),
    enabled: Boolean(memberId),
  });
}

export function useClubStats() {
  return useQuery({ queryKey: queryKeys.clubStats, queryFn: () => api.clubStats() });
}

export function useTodaysAttendance() {
  return useQuery({ queryKey: queryKeys.todaysAttendance, queryFn: () => api.todaysAttendance(), refetchInterval: 30_000 });
}

export function useClubName() {
  return useQuery({ queryKey: queryKeys.clubName, queryFn: () => api.clubName(), staleTime: Infinity });
}

/** Token z kodu QR — widok administracyjny i podpowiedzi na ekranie check-inu. */
export function useCheckInToken(enabled = true) {
  return useQuery({ queryKey: [...queryKeys.clubName, 'token'], queryFn: () => api.checkInToken(), enabled, staleTime: 60_000 });
}

/** Wymiana tokenu QR (admin). */
export function useRotateToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.rotateCheckInToken(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...queryKeys.clubName, 'token'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutacje — każda unieważnia minimalny zestaw kluczy i zwraca komunikat z RPC.
// ---------------------------------------------------------------------------

function useInvalidatingMutation<TArgs, TResult extends ActionResult = ActionResult>(
  fn: (args: TArgs) => Promise<TResult>,
  invalidate: ReadonlyArray<ReadonlyArray<unknown>>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      if (!result.ok) return;
      await Promise.all(invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })));
    },
  });
}

export function useJoinSession() {
  return useInvalidatingMutation(({ sessionId }: { sessionId: string }) => api.join(sessionId), [
    ['sessions'],
    ['session'],
  ]);
}

export function useLeaveSession() {
  return useInvalidatingMutation(({ sessionId }: { sessionId: string }) => api.leave(sessionId), [
    ['sessions'],
    ['session'],
  ]);
}

export function useCheckIn() {
  return useInvalidatingMutation(({ token, sessionId }: { token: string; sessionId?: string | null }) => api.checkIn(token, sessionId), [
    ['sessions'],
    ['session'],
    queryKeys.todaysAttendance,
    ['stats'],
    queryKeys.clubStats,
  ]);
}

export function useMarkAttendance() {
  return useInvalidatingMutation(
    ({ sessionId, memberId, present }: { sessionId: string; memberId: string; present: boolean }) =>
      api.markAttendance(sessionId, memberId, present),
    [['session'], ['sessions'], queryKeys.todaysAttendance, ['stats'], queryKeys.clubStats]
  );
}

export function useVote() {
  return useInvalidatingMutation(({ pollId, optionId }: { pollId: string; optionId: string }) => api.vote(pollId, optionId), [
    ['poll'],
    ['sessions'],
  ]);
}

export function usePollSuggestion() {
  return useInvalidatingMutation(({ pollId, label }: { pollId: string; label: string }) => api.addPollSuggestion(pollId, label), [['poll']]);
}

export function usePublishPoll() {
  return useInvalidatingMutation(
    ({ sessionId, labels, techniqueIds }: { sessionId: string; labels: ReadonlyArray<string>; techniqueIds: ReadonlyArray<string | null> }) =>
      api.publishPoll(sessionId, labels, techniqueIds),
    [['poll'], ['sessions'], queryKeys.techniques]
  );
}

export function useDecidePoll() {
  return useInvalidatingMutation(({ pollId, optionId }: { pollId: string; optionId: string }) => api.decidePoll(pollId, optionId), [['poll'], ['sessions']]);
}

export function useCancelSession() {
  return useInvalidatingMutation(({ sessionId, reason }: { sessionId: string; reason: string }) => api.cancelSession(sessionId, reason), [
    ['sessions'],
    ['session'],
    queryKeys.clubStats,
  ]);
}

export function useCloseSession() {
  return useInvalidatingMutation(({ sessionId }: { sessionId: string }) => api.closeSession(sessionId), [
    ['sessions'],
    ['session'],
    ['stats'],
    queryKeys.clubStats,
  ]);
}

export function useSyncSchedule() {
  return useInvalidatingMutation(() => api.syncSchedule(), [['sessions'], queryKeys.templates]);
}

export function useSaveTemplate() {
  return useInvalidatingMutation((template: Parameters<typeof api.saveTemplate>[0]) => api.saveTemplate(template), [
    queryKeys.templates,
    ['sessions'],
  ]);
}

export function useSetTemplateActive() {
  return useInvalidatingMutation(({ id, active }: { id: string; active: boolean }) => api.setActiveTemplate(id, active), [
    queryKeys.templates,
    ['sessions'],
  ]);
}

export function useAssignBelt() {
  return useInvalidatingMutation(
    ({ memberId, belt, stripe, note }: { memberId: string; belt: Parameters<typeof api.assignBelt>[1]; stripe: 0 | 1 | 2 | 3 | 4; note: string | null }) =>
      api.assignBelt(memberId, belt, stripe, note),
    [queryKeys.members, ['member']]
  );
}

export function useSetMembership() {
  return useInvalidatingMutation(({ memberId, status }: { memberId: string; status: Parameters<typeof api.setMembership>[1] }) => api.setMembership(memberId, status), [
    queryKeys.members,
    ['member'],
    queryKeys.clubStats,
  ]);
}

export function useCreateMember() {
  return useInvalidatingMutation((input: NewMemberInput) => api.createMember(input), [queryKeys.members, queryKeys.clubStats]);
}

export function useSparringIntent() {
  return useInvalidatingMutation(
    (input: SparringIntentInput) => api.setSparringIntent(input),
    [['sparring']]
  );
}

export function useClearSparringIntent() {
  return useInvalidatingMutation(({ sessionId }: { sessionId: string }) => api.clearSparringIntent(sessionId), [['sparring']]);
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof api.updateMe>[0]) => api.updateMe(patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}
