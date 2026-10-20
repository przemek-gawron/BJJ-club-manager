/**
 * Reguły check-inu przez QR.
 *
 * Token w kodzie QR jest publiczny (wisi na ścianie), dlatego cała ochrona jest po stronie
 * serwera/reguł: tylko aktywny członek, tylko w oknie czasowym, tylko raz na sesję.
 */

import { addMinutes, formatWarsawTime } from '@/lib/poland-time';

/** Okno check-inu: 60 min przed startem do 90 min po starcie. */
export const CHECK_IN_LEAD_MINUTES = 60;
export const CHECK_IN_GRACE_MINUTES = 90;

export interface CheckInWindow {
  readonly opensAt: Date;
  readonly closesAt: Date;
}

export function checkInWindow(startsAt: Date): CheckInWindow {
  return {
    opensAt: addMinutes(startsAt, -CHECK_IN_LEAD_MINUTES),
    closesAt: addMinutes(startsAt, CHECK_IN_GRACE_MINUTES),
  };
}

export type WindowState = 'too_early' | 'open' | 'too_late';

export function evaluateWindow(startsAt: Date, now: Date): WindowState {
  const { opensAt, closesAt } = checkInWindow(startsAt);
  if (now.getTime() < opensAt.getTime()) return 'too_early';
  if (now.getTime() > closesAt.getTime()) return 'too_late';
  return 'open';
}

/**
 * Spośród kandydujących sesji wybiera tę, do której należy check-in.
 * Preferujemy sesje, które już wystartowały (najbliższa przeszłość), a jeżeli żadna nie wystartowała —
 * najbliższą przyszłą w oknie. Dzięki temu skan przed porannymi zajęciami nie „skradnie” wieczornych.
 */
export function pickSessionForCheckIn<T extends { startsAt: Date }>(sessions: ReadonlyArray<T>, now: Date): T | null {
  const inWindow = sessions.filter((s) => evaluateWindow(s.startsAt, now) === 'open');
  if (inWindow.length === 0) return null;
  const started = inWindow.filter((s) => s.startsAt.getTime() <= now.getTime());
  if (started.length > 0) {
    return started.reduce((best, s) => (s.startsAt.getTime() > best.startsAt.getTime() ? s : best));
  }
  return inWindow.reduce((best, s) => (s.startsAt.getTime() < best.startsAt.getTime() ? s : best));
}

export interface CheckInDecision {
  readonly kind: 'checked_in' | 'already_checked_in' | 'too_early' | 'too_late';
  readonly ok: boolean;
  readonly message: string;
}

/** Decyzja dla skanu skierowanego na konkretną sesję (deep-link zawiera jej id). */
export function decideCheckIn(args: {
  readonly now: Date;
  readonly startsAt: Date;
  readonly alreadyCheckedIn: boolean;
  readonly className: string;
}): CheckInDecision {
  if (args.alreadyCheckedIn) {
    return {
      kind: 'already_checked_in',
      ok: true,
      message: `Jesteś już na liście dzisiejszych zajęć (${args.className}). Dobrego treningu!`,
    };
  }
  const state = evaluateWindow(args.startsAt, args.now);
  if (state === 'too_early') {
    return {
      kind: 'too_early',
      ok: false,
      message: `Za wcześnie. Check-in do „${args.className}” otwiera się o ${formatWarsawTime(addMinutes(args.startsAt, -CHECK_IN_LEAD_MINUTES))}.`,
    };
  }
  if (state === 'too_late') {
    return {
      kind: 'too_late',
      ok: false,
      message: `Za późno — okno dla „${args.className}” zamknęło się o ${formatWarsawTime(addMinutes(args.startsAt, CHECK_IN_GRACE_MINUTES))}. Poproś trenera o dopisanie.`,
    };
  }
  return {
    kind: 'checked_in',
    ok: true,
    message: `Jesteś na macie — ${args.className}. Miłego treningu!`,
  };
}

export function isSessionFinished(endsAt: Date, now: Date): boolean {
  return now.getTime() >= endsAt.getTime();
}

/**
 * Rozbiera treść kodu QR. Kod klubu ma format `bjjclub://check-in?t=<token>&s=<sessionId>`,
 * ale tolerujemy też zwykły HTTPS z tymi samymi parametrami oraz goły token.
 */
export interface CheckInPayload {
  readonly token: string;
  readonly sessionId: string | null;
}

export function parseCheckInPayload(raw: string): CheckInPayload | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  const queryIndex = value.search(/[?]/);
  if (queryIndex === -1) {
    // Goły token bez struktury URL — akceptujemy tylko wartości bez spacji.
    if (/\s/.test(value)) return null;
    return { token: value, sessionId: null };
  }

  const query = value.slice(queryIndex + 1);
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (pair.length === 0) continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
    const val = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1));
    if (val.length > 0) params.set(key, val);
  }

  const token = params.get('t') ?? params.get('token');
  if (!token || token.length === 0) return null;
  const session = params.get('s') ?? params.get('sessionId') ?? null;
  return { token, sessionId: session && session.length > 0 ? session : null };
}
