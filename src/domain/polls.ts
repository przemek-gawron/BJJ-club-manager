/**
 * Logika ankiet „co trenujemy”.
 *
 * Zasady uzgodnione z klubem:
 * - 1 głos na członka, ale zmienialny do chwili zamknięcia,
 * - głosować mogą tylko zapisani (statusu `cancelled` nie liczymy),
 * - ankietę zamykamy 30 min przez startem sesji,
 * - wygrywa większość; remis rozwiązywany deterministycznie:
 *   1) propozycja dodana przez trenera bije propozycję członka,
 *   2) dalej wygrywa ta dodana wcześniej,
 *   3) na końcu alfabetycznie — żeby wynik nigdy nie zależał od kolejności w bazie.
 */

import type { Poll, PollOption, PollOptionTally, PollStatus, PollVote } from './types';

export const POLL_CLOSE_MINUTES_BEFORE = 30;

export function pollStatus(poll: Pick<Poll, 'status' | 'closesAt'>, now: Date): PollStatus {
  if (poll.status === 'draft') return 'draft';
  if (poll.status === 'closed') return 'closed';
  return new Date(poll.closesAt).getTime() <= now.getTime() ? 'closed' : 'open';
}

export function canVote(args: {
  readonly status: PollStatus;
  readonly isSignedUp: boolean;
  readonly membershipActive: boolean;
  readonly isCoachOrAdmin: boolean;
}): boolean {
  if (args.status !== 'open') return false;
  if (!args.membershipActive) return false;
  // Trener nie głosuje we własnej ankiecie — jego zdanie i tak jest w propozycjach.
  if (args.isCoachOrAdmin) return false;
  return args.isSignedUp;
}

/** Tie-break bez dostępu do bazy: pozycja w kolejności tworzenia jest odzwierciedlona w `position`. */
function compareOptions(a: PollOption, b: PollOption): number {
  const aCoach = a.source === 'coach' ? 0 : 1;
  const bCoach = b.source === 'coach' ? 0 : 1;
  if (aCoach !== bCoach) return aCoach - bCoach;
  if (a.position !== b.position) return a.position - b.position;
  return a.label.localeCompare(b.label, 'pl');
}

export interface TallyInput {
  readonly options: ReadonlyArray<PollOption>;
  readonly votes: ReadonlyArray<PollVote>;
  readonly myVoteOptionId?: string | null;
  readonly decidedOptionId?: string | null;
}

export interface TallyResult {
  readonly options: ReadonlyArray<PollOptionTally>;
  readonly totalVotes: number;
  readonly winnerOptionId: string | null;
}

export function tallyVotes(input: TallyInput): TallyResult {
  const counts = new Map<string, number>();
  for (const vote of input.votes) {
    if (!input.options.some((o) => o.id === vote.optionId)) continue;
    counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
  }

  const ranked = [...input.options]
    .map((option) => ({ option, votes: counts.get(option.id) ?? 0 }))
    .sort((a, b) => b.votes - a.votes || compareOptions(a.option, b.option));

  const totalVotes = ranked.reduce((sum, row) => sum + row.votes, 0);
  const top = ranked[0];
  const winnerOptionId = totalVotes === 0 ? null : (top?.option.id ?? null);

  return {
    options: ranked.map(({ option, votes }) => ({
      option,
      votes,
      isWinner: option.id === winnerOptionId,
      myVote: input.myVoteOptionId != null && input.myVoteOptionId === option.id,
    })),
    totalVotes,
    winnerOptionId: input.decidedOptionId ?? winnerOptionId,
  };
}

/** Czy głos jest ważny: tylko zapisani, tylko otwarta ankieta, tylko istniejąca propozycja. */
export function validateVote(args: {
  readonly status: PollStatus;
  readonly optionBelongsToPoll: boolean;
  readonly isSignedUp: boolean;
  readonly membershipActive: boolean;
  readonly isCoachOrAdmin: boolean;
}): { ok: boolean; message: string } {
  if (args.status !== 'open') return { ok: false, message: 'Ankieta jest zamknięta.' };
  if (!args.membershipActive) return { ok: false, message: 'Aktywuj członkostwo, żeby głosować.' };
  if (args.isCoachOrAdmin) return { ok: false, message: 'Głosują tylko członkowie klubu.' };
  if (!args.isSignedUp) return { ok: false, message: 'Głosować mogą tylko zapisani na te zajęcia.' };
  if (!args.optionBelongsToPoll) return { ok: false, message: 'Ta propozycja nie należy do ankiety.' };
  return { ok: true, message: 'Głos zapisany.' };
}

/** Limit propozycji: trener publikuje 3–5, członek może dodać maksymalnie 1 do aktywnej ankiety. */
export const MAX_POLL_OPTIONS = 6;
export const MIN_POLL_OPTIONS = 2;
export const MAX_MEMBER_SUGGESTIONS = 2;

export function canAddMemberSuggestion(args: {
  readonly status: PollStatus;
  readonly existingMemberSuggestions: number;
  readonly isSignedUp: boolean;
}): { ok: boolean; message: string } {
  if (args.status !== 'open') return { ok: false, message: 'Ankieta jest zamknięta.' };
  if (!args.isSignedUp) return { ok: false, message: 'Swoją propozycję mogą dodawać tylko zapisani.' };
  if (args.existingMemberSuggestions >= MAX_MEMBER_SUGGESTIONS) {
    return { ok: false, message: `Maksymalnie ${MAX_MEMBER_SUGGESTIONS} propozycje od członków w jednej ankiecie.` };
  }
  return { ok: true, message: 'Dodano propozycję.' };
}

export function pollClosesLabel(closesAt: string, now: Date): string {
  const diff = new Date(closesAt).getTime() - now.getTime();
  if (diff <= 0) return 'zamknięta';
  const minutes = Math.round(diff / 60000);
  if (minutes < 60) return `za ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `za ${hours} h ${rest} min` : `za ${hours} h`;
}
