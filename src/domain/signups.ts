/**
 * Frekwencja i limity miejsc.
 *
 * Zapis jest dobrowolny (służy do limitu miejsc i do prawa głosu w ankiecie),
 * a do statystyk liczy się wyłącznie obecność: check-in QR albo dopisanie przez trenera.
 */

import type { AttendanceOutcome, AttendanceRecord, Session, Signup, SignupStatus } from './types';

export interface CapacityResult {
  readonly status: SignupStatus;
  readonly waitlistPosition: number | null;
  readonly seatsLeft: number | null;
  readonly message: string;
}

/**
 * Przypisuje nowych chętnych: najpierw miejsca podstawowe, potem lista rezerwowa.
 * `activeMembers` to członkowie z aktywnym zapisem (bez rezerwowych i bez anulowanych).
 */
export function assignPlace(args: {
  readonly activeCount: number;
  readonly waitlistCount: number;
  readonly capacity: number | null;
}): CapacityResult {
  if (args.capacity == null) {
    return { status: 'active', waitlistPosition: null, seatsLeft: null, message: 'Zapisano — bez limitu miejsc.' };
  }
  if (args.activeCount < args.capacity) {
    const seatsLeft = args.capacity - args.activeCount - 1;
    return { status: 'active', waitlistPosition: null, seatsLeft, message: 'Zapisano. Masz miejsce na macie.' };
  }
  const position = args.waitlistCount + 1;
  return {
    status: 'waitlist',
    waitlistPosition: position,
    seatsLeft: 0,
    message: `Wolnych miejsc brak — jesteś w rezerwie na pozycji ${position}. Zwolni się miejsce, wejdziesz automatycznie.`,
  };
}

/**
 * Po anulowaniu zapisu przesuwamy pierwszego rezerwowego na zwolnione miejsce.
 * Zwraca id członków, których trzeba przesunąć (w kolejności ich pozycji w rezerwie).
 */
export function promoteFromWaitlist(args: {
  readonly capacity: number | null;
  readonly activeCountAfterCancel: number;
  readonly waitlist: ReadonlyArray<Signup>;
}): ReadonlyArray<Signup> {
  if (args.capacity == null) return [];
  const free = args.capacity - args.activeCountAfterCancel;
  if (free <= 0) return [];
  return [...args.waitlist]
    .sort((a, b) => (a.waitlistPosition ?? 99) - (b.waitlistPosition ?? 99) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, free);
}

export interface SignupState {
  readonly status: SignupStatus | null;
  readonly waitlistPosition: number | null;
}

/** Stan zapisu konkretnej osoby na konkretne zajęcia. */
export function signupStateFor(signups: ReadonlyArray<Signup>, memberId: string): SignupState {
  const mine = signups.find((s) => s.memberId === memberId && s.status !== 'cancelled');
  if (!mine) return { status: null, waitlistPosition: null };
  return { status: mine.status, waitlistPosition: mine.waitlistPosition };
}

export function canCancelSignup(session: Session, now: Date): { ok: boolean; message: string } {
  if (new Date(session.startsAt).getTime() <= now.getTime()) {
    return { ok: false, message: 'Po starcie zajęć nie anulujesz zapisu — zgłoś się i trenuj albo poproś trenera o zmianę.' };
  }
  return { ok: true, message: 'Zapis anulowany.' };
}

/**
 * Klasyfikuje obecność po zakończonych zajęciach:
 * - kto przyszedł (check-in QR lub dopisany przez trenera) -> `attended`,
 * - kto był zapisany, ale nie przyszedł -> `no_show`,
 * - rezerwowi bez check-inu nie są liczeni jako nieobecność (nie mieli miejsca).
 */
/**
 * Klasyfikuje każdego zapisanego (aktywnego) członka: `attended` albo `no_show`.
 * Rezerwowi bez check-inu nie tracą nic — nie mieli miejsca do wykorzystania.
 */
export function resolveOutcomes(args: {
  readonly signups: ReadonlyArray<Signup>;
  readonly attendance: ReadonlyArray<AttendanceRecord>;
}): Map<string, AttendanceOutcome> {
  const present = new Set(args.attendance.map((a) => a.memberId));
  const outcomes = new Map<string, AttendanceOutcome>();
  for (const signup of args.signups) {
    if (signup.status !== 'active') continue;
    outcomes.set(signup.memberId, present.has(signup.memberId) ? 'attended' : 'no_show');
  }
  for (const record of args.attendance) {
    outcomes.set(record.memberId, 'attended');
  }
  return outcomes;
}

export function countNoShows(args: {
  readonly signups: ReadonlyArray<Signup>;
  readonly attendance: ReadonlyArray<AttendanceRecord>;
}): number {
  const present = new Set(args.attendance.map((a) => a.memberId));
  return args.signups.filter((s) => s.status === 'active' && !present.has(s.memberId)).length;
}

/** Frekwencja na zajęciach: liczba obecnych niezależnie od źródła. */
export function attendanceCount(attendance: ReadonlyArray<AttendanceRecord>): number {
  return new Set(attendance.map((a) => a.memberId)).size;
}
