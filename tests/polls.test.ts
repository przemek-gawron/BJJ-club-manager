import { describe, expect, it } from 'vitest';

import { canAddMemberSuggestion, canVote, pollStatus, tallyVotes, validateVote } from '@/domain/polls';
import type { PollOption, PollVote } from '@/domain/types';

const opt = (id: string, source: 'coach' | 'member', position: number, label = id): PollOption => ({
  id,
  pollId: 'p1',
  label,
  techniqueId: null,
  source,
  createdById: source === 'coach' ? 'coach-1' : 'member-1',
  createdAt: `2026-10-1${position}T08:00:00.000Z`,
  position,
});

const vote = (memberId: string, optionId: string): PollVote => ({
  pollId: 'p1',
  memberId,
  optionId,
  updatedAt: '2026-10-19T08:00:00.000Z',
});

describe('status ankiety', () => {
  it('draft nie jest otwarty', () => {
    expect(pollStatus({ status: 'draft', closesAt: '2026-10-20T18:30:00.000Z' }, new Date('2026-10-20T08:00:00.000Z'))).toBe('draft');
  });

  it('open z przyszłym closesAt jest otwarty', () => {
    expect(pollStatus({ status: 'open', closesAt: '2026-10-20T18:30:00.000Z' }, new Date('2026-10-20T08:00:00.000Z'))).toBe('open');
  });

  it('po closesAt zamyka się automatycznie', () => {
    expect(pollStatus({ status: 'open', closesAt: '2026-10-20T18:30:00.000Z' }, new Date('2026-10-20T18:31:00.000Z'))).toBe('closed');
  });
});

describe('prawo głosu', () => {
  it('głosować mogą tylko zapisani członkowie', () => {
    expect(canVote({ status: 'open', isSignedUp: true, membershipActive: true, isCoachOrAdmin: false })).toBe(true);
    expect(canVote({ status: 'open', isSignedUp: false, membershipActive: true, isCoachOrAdmin: false })).toBe(false);
    expect(canVote({ status: 'open', isSignedUp: true, membershipActive: false, isCoachOrAdmin: false })).toBe(false);
    expect(canVote({ status: 'closed', isSignedUp: true, membershipActive: true, isCoachOrAdmin: false })).toBe(false);
  });

  it('trener nie głosuje we własnej ankiecie', () => {
    expect(canVote({ status: 'open', isSignedUp: true, membershipActive: true, isCoachOrAdmin: true })).toBe(false);
  });
});

describe('przeliczanie głosów', () => {
  it('wygrywa propozycja z większością', () => {
    const options = [opt('a', 'coach', 0), opt('b', 'coach', 1), opt('c', 'member', 2)];
    const votes = [vote('m1', 'b'), vote('m2', 'b'), vote('m3', 'a'), vote('m4', 'c')];
    const result = tallyVotes({ options, votes });
    expect(result.totalVotes).toBe(4);
    expect(result.winnerOptionId).toBe('b');
    expect(result.options.find((o) => o.option.id === 'b')?.votes).toBe(2);
    expect(result.options[0]?.isWinner).toBe(true);
  });

  it('przy remisie wygrywa propozycja trenera', () => {
    const options = [opt('memberidea', 'member', 5), opt('coachidea', 'coach', 9)];
    const votes = [vote('m1', 'memberidea'), vote('m2', 'coachidea')];
    const result = tallyVotes({ options, votes });
    expect(result.winnerOptionId).toBe('coachidea');
  });

  it('przy remisie dwóch propozycji członków wygrywa starsza (niższa pozycja)', () => {
    const options = [opt('nowa', 'member', 7), opt('starsza', 'member', 3)];
    const votes = [vote('m1', 'nowa'), vote('m2', 'starsza')];
    expect(tallyVotes({ options, votes }).winnerOptionId).toBe('starsza');
  });

  it('pusta ankieta nie ma zwycięzcy', () => {
    const result = tallyVotes({ options: [opt('a', 'coach', 0)], votes: [] });
    expect(result.totalVotes).toBe(0);
    expect(result.winnerOptionId).toBeNull();
    expect(result.options[0]?.isWinner).toBe(false);
  });

  it('oznacza mój głos', () => {
    const options = [opt('a', 'coach', 0), opt('b', 'coach', 1)];
    const result = tallyVotes({ options, votes: [vote('me', 'b')], myVoteOptionId: 'b' });
    expect(result.options.find((o) => o.option.id === 'b')?.myVote).toBe(true);
    expect(result.options.find((o) => o.option.id === 'a')?.myVote).toBe(false);
  });

  it('głos na propozycję spoza ankiety jest ignorowany', () => {
    const options = [opt('a', 'coach', 0)];
    const result = tallyVotes({ options, votes: [vote('m1', 'ghost')] });
    expect(result.totalVotes).toBe(0);
  });

  it('decyzja trenera nadpisuje wynik głosowania', () => {
    const options = [opt('a', 'coach', 0), opt('b', 'coach', 1)];
    const result = tallyVotes({ options, votes: [vote('m1', 'b'), vote('m2', 'b')], decidedOptionId: 'a' });
    expect(result.winnerOptionId).toBe('a');
  });
});

describe('walidacja głosu', () => {
  it('odrzuca głos po zamknięciu', () => {
    expect(validateVote({ status: 'closed', optionBelongsToPoll: true, isSignedUp: true, membershipActive: true, isCoachOrAdmin: false }).ok).toBe(false);
  });

  it('odrzuca głos niezapisanego', () => {
    const r = validateVote({ status: 'open', optionBelongsToPoll: true, isSignedUp: false, membershipActive: true, isCoachOrAdmin: false });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('zapisani');
  });

  it('przyjmuje poprawny głos', () => {
    expect(validateVote({ status: 'open', optionBelongsToPoll: true, isSignedUp: true, membershipActive: true, isCoachOrAdmin: false }).ok).toBe(true);
  });
});

describe('propozycje członków', () => {
  it('niezapisany nie doda swojej propozycji', () => {
    expect(canAddMemberSuggestion({ status: 'open', existingMemberSuggestions: 0, isSignedUp: false }).ok).toBe(false);
  });

  it('limit propozycji od członków to 2', () => {
    expect(canAddMemberSuggestion({ status: 'open', existingMemberSuggestions: 1, isSignedUp: true }).ok).toBe(true);
    expect(canAddMemberSuggestion({ status: 'open', existingMemberSuggestions: 2, isSignedUp: true }).ok).toBe(false);
  });
});
