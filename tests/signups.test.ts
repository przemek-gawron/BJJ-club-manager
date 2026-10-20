import { describe, expect, it } from 'vitest';

import { assignPlace, canCancelSignup, countNoShows, promoteFromWaitlist, resolveOutcomes, signupStateFor } from '@/domain/signups';
import type { AttendanceRecord, Session, Signup } from '@/domain/types';
import { warsawToUtc } from '@/lib/poland-time';

const session: Session = {
  id: 's1',
  classTemplateId: 't1',
  coachId: 'c1',
  startsAt: warsawToUtc({ year: 2026, month: 10, day: 20, hour: 19, minute: 30 }).toISOString(),
  endsAt: warsawToUtc({ year: 2026, month: 10, day: 20, hour: 20, minute: 30 }).toISOString(),
  status: 'scheduled',
  cancelledReason: null,
  capacityOverride: null,
};

const signup = (memberId: string, status: Signup['status'], waitlistPosition: number | null = null): Signup => ({
  id: `su-${memberId}`,
  sessionId: 's1',
  memberId,
  status,
  waitlistPosition,
  createdAt: `2026-10-19T08:0${waitlistPosition ?? 0}:00.000Z`,
  cancelledAt: null,
});

const record = (memberId: string, sessionId = 's1'): AttendanceRecord => ({
  id: `att-${memberId}`,
  sessionId,
  memberId,
  checkedInAt: warsawToUtc({ year: 2026, month: 10, day: 20, hour: 19, minute: 35 }).toISOString(),
  source: 'qr',
  markedById: null,
  outcome: 'attended',
});

describe('limity miejsc', () => {
  it('bez limitu każdy dostaje miejsce', () => {
    expect(assignPlace({ activeCount: 40, waitlistCount: 0, capacity: null }).status).toBe('active');
  });

  it('dopóki są miejsca, zapis jest aktywny', () => {
    const r = assignPlace({ activeCount: 3, waitlistCount: 0, capacity: 12 });
    expect(r.status).toBe('active');
    expect(r.seatsLeft).toBe(8);
  });

  it('po wyczerpaniu miejsc trafia się do rezerwy z pozycją', () => {
    const r = assignPlace({ activeCount: 12, waitlistCount: 2, capacity: 12 });
    expect(r.status).toBe('waitlist');
    expect(r.waitlistPosition).toBe(3);
    expect(r.message).toContain('3');
  });
});

describe('rezerwa', () => {
  it('anulowanie zapisu awansuje pierwszego rezerwowego', () => {
    const waitlist = [signup('m9', 'waitlist', 2), signup('m8', 'waitlist', 1)];
    const promoted = promoteFromWaitlist({ capacity: 12, activeCountAfterCancel: 11, waitlist });
    expect(promoted.map((s) => s.memberId)).toEqual(['m8']);
  });

  it('awansuje tylu, ile jest wolnych miejsc', () => {
    const waitlist = [signup('m8', 'waitlist', 1), signup('m9', 'waitlist', 2), signup('m10', 'waitlist', 3)];
    const promoted = promoteFromWaitlist({ capacity: 12, activeCountAfterCancel: 10, waitlist });
    expect(promoted.map((s) => s.memberId)).toEqual(['m8', 'm9']);
  });

  it('bez wolnych miejsc nikt nie awansuje', () => {
    expect(promoteFromWaitlist({ capacity: 12, activeCountAfterCancel: 12, waitlist: [signup('m8', 'waitlist', 1)] })).toEqual([]);
  });
});

describe('stan zapisu członka', () => {
  it('rozróżnia miejsce, rezerwę i brak zapisu', () => {
    const signups = [signup('a', 'active'), signup('b', 'waitlist', 1), signup('c', 'cancelled')];
    expect(signupStateFor(signups, 'a').status).toBe('active');
    expect(signupStateFor(signups, 'b').waitlistPosition).toBe(1);
    expect(signupStateFor(signups, 'c').status).toBeNull();
    expect(signupStateFor(signups, 'zz').status).toBeNull();
  });
});

describe('obecność i nieobecność', () => {
  it('oznacza nieobecnych zapisanych jako no_show', () => {
    const outcomes = resolveOutcomes({
      signups: [signup('a', 'active'), signup('b', 'active'), signup('c', 'waitlist', 1)],
      attendance: [record('a')],
    });
    expect(outcomes.get('a')).toBe('attended');
    expect(outcomes.get('b')).toBe('no_show');
    expect(outcomes.has('c')).toBe(false);
  });

  it('osoba dopisana przez trenera bez zapisu jest liczona jako obecna', () => {
    const outcomes = resolveOutcomes({ signups: [], attendance: [record('gość')] });
    expect(outcomes.get('gość')).toBe('attended');
  });

  it('liczy no-showy dla trenera', () => {
    expect(countNoShows({ signups: [signup('a', 'active'), signup('b', 'active')], attendance: [record('a')] })).toBe(1);
  });
});

describe('anulowanie zapisu', () => {
  it('dozwolone do startu zajęć', () => {
    const before = warsawToUtc({ year: 2026, month: 10, day: 20, hour: 19, minute: 0 });
    expect(canCancelSignup(session, before).ok).toBe(true);
  });

  it('zablokowane po starcie', () => {
    const after = warsawToUtc({ year: 2026, month: 10, day: 20, hour: 20, minute: 0 });
    expect(canCancelSignup(session, after).ok).toBe(false);
  });
});
