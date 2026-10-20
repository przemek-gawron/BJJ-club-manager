/**
 * Materializacja grafiku: szablon tygodniowy -> konkretne sesje.
 * Wszystko liczone w Europe/Warsaw i zapisywane jako UTC, więc DST nie rozjedzie godzin.
 */

import { addWarsawDays, combineWarsaw, startOfWarsawDay, warsawWeekday, weekdayName } from '@/lib/poland-time';
import type { ClassTemplate, Session, SessionStatus } from './types';

/** Jak daleko w przyszłość generujemy sesje (dni). */
export const MATERIALIZE_DAYS_AHEAD = 21;

/** Jak daleko wstecz generujemy, żeby historia frekwencji była spójna (dni). */
export const MATERIALIZE_DAYS_BEHIND = 42;

export interface GeneratedSession {
  readonly key: string;
  readonly classTemplateId: string;
  readonly coachId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: SessionStatus;
}

/** Klucz odporny na duplikaty przy ponownej materializacji. */
export function sessionKey(classTemplateId: string, startsAt: string): string {
  return `${classTemplateId}@${startsAt}`;
}

/**
 * Generuje sesje dla szablonów w oknie [dziś - daysBehind dni, dziś + daysAhead dni].
 * `now` jest parametrem, żeby dało się to otestować deterministycznie.
 */
export function materializeSessions(
  templates: ReadonlyArray<ClassTemplate>,
  now: Date,
  daysBehind = MATERIALIZE_DAYS_BEHIND,
  daysAhead = MATERIALIZE_DAYS_AHEAD
): GeneratedSession[] {
  const firstDay = addWarsawDays(startOfWarsawDay(now), -daysBehind);
  const lastDay = addWarsawDays(startOfWarsawDay(now), daysAhead);
  const out: GeneratedSession[] = [];

  for (let offset = 0; offset <= daysBehind + daysAhead; offset += 1) {
    const day = addWarsawDays(firstDay, offset);
    if (day.getTime() > lastDay.getTime()) break;
    const weekday = warsawWeekday(day);
    for (const template of templates) {
      if (!template.active || template.weekday !== weekday) continue;
      const startsAt = combineWarsaw(day, template.startTime);
      const endsAt = new Date(startsAt.getTime() + template.durationMinutes * 60_000);
      out.push({
        key: sessionKey(template.id, startsAt.toISOString()),
        classTemplateId: template.id,
        coachId: template.coachId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: 'scheduled',
      });
    }
  }

  return dedupe(out);
}

function dedupe(sessions: ReadonlyArray<GeneratedSession>): GeneratedSession[] {
  const map = new Map<string, GeneratedSession>();
  for (const session of sessions) map.set(session.key, session);
  return [...map.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export interface UpcomingGroups {
  readonly today: Session[];
  readonly tomorrow: Session[];
  readonly rest: Session[];
}

/** Grupuje sesje na „dziś / jutro / później” wg czasu klubu. */
export function groupByDay(sessions: ReadonlyArray<Session>, templateById: Map<string, ClassTemplate>, now: Date): UpcomingGroups {
  const todayKey = startOfWarsawDay(now).getTime();
  const tomorrowKey = addWarsawDays(new Date(todayKey), 1).getTime();
  const groups: UpcomingGroups = { today: [], tomorrow: [], rest: [] };

  for (const session of sessions) {
    if (!templateById.has(session.classTemplateId)) continue;
    if (session.status === 'cancelled') continue;
    if (new Date(session.endsAt).getTime() < now.getTime()) continue;
    const startsDay = startOfWarsawDay(new Date(session.startsAt)).getTime();
    if (startsDay === todayKey) groups.today.push(session);
    else if (startsDay === tomorrowKey) groups.tomorrow.push(session);
    else groups.rest.push(session);
  }

  const byStart = (a: Session, b: Session) => a.startsAt.localeCompare(b.startsAt);
  return {
    today: groups.today.sort(byStart),
    tomorrow: groups.tomorrow.sort(byStart),
    rest: groups.rest.sort(byStart),
  };
}

export function describeAbsence(template: ClassTemplate): string {
  return `${template.name} — ${weekdayName(template.weekday)}, brak zajęcia w tym terminie`;
}

/** Czy zapis jest jeszcze możliwy (do startu sesji) — członkostwo i limity sprawdzamy wyżej. */
export function canManageSignup(session: Session, now: Date): { ok: boolean; message: string } {
  if (session.status === 'cancelled') return { ok: false, message: 'Zajęcia zostały odwołane.' };
  if (new Date(session.startsAt).getTime() <= now.getTime()) {
    return { ok: false, message: 'Zajęcia już się rozpoczęły — zapisy zamknięte. Trener może dopisać ręcznie.' };
  }
  return { ok: true, message: 'OK' };
}

export const CANCELLATION_REASONS = ['Choroba trenera', 'Wyjazd / seminar', 'Mata zajęta', 'Za mała frekwencja', 'Inne'] as const;
