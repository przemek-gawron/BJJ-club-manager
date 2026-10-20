/**
 * Statystyki frekwencji.
 *
 * Passa (streak) liczona jest w TYGODNIACH — w klubie trenuje się 2-3 razy w tygodniu,
 * więc streak dzienny byłby frustrujący. Tydzień liczony od poniedziałku wg czasu klubu.
 */

import { daysBetweenWarsaw, startOfWarsawDay, startOfWarsawWeek, utcToWarsaw, warsawDayKey, warsawToUtc, warsawWeekday } from '@/lib/poland-time';
import type { AttendanceRecord, ClassTemplate, ClassType, MemberStats } from './types';

/** Unikalne dni (klucz YYYY-MM-DD czasu klubu), w których członek trenował. */
export function trainingDayKeys(records: ReadonlyArray<AttendanceRecord>): string[] {
  const keys = new Set<string>();
  for (const record of records) keys.add(warsawDayKey(new Date(record.checkedInAt)));
  return [...keys].sort();
}

/**
 * Numery tygodni od ustalonego poniedziałku. Używamy liczb całkowitych zamiast porównywania Date,
 * żeby przejścia na czas letni/zimowy nie fałszowały różnic o kilka godzin.
 */
const WEEK_EPOCH_MS = Date.UTC(2020, 0, 20); // poniedziałek 2020-01-20

export function weekIndex(instant: Date | string | number): number {
  const weekStart = startOfWarsawWeek(instant);
  return Math.round((weekStart.getTime() - WEEK_EPOCH_MS) / (7 * 86_400_000));
}

function weekIndexOf(instant: Date | string | number): number {
  return weekIndex(instant);
}

/**
 * Kolejne tygodnie z co najmniej jednym treningiem, licząc wstecz.
 * Bieżący tydzień bez treningu nie przerywa passy — dopiero pełny pusty tydzień ją zrywa.
 */
export function weekStreak(records: ReadonlyArray<AttendanceRecord>, now: Date): number {
  const weeks = new Set(records.map((r) => weekIndexOf(r.checkedInAt)));
  if (weeks.size === 0) return 0;

  let cursor = weekIndexOf(now);
  if (!weeks.has(cursor)) cursor -= 1;

  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/** Najdłuższa passa tygodniowa w całej historii. */
export function longestWeekStreak(records: ReadonlyArray<AttendanceRecord>): number {
  const weeks = [...new Set(records.map((r) => weekIndexOf(r.checkedInAt)))].sort((a, b) => a - b);
  if (weeks.length === 0) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < weeks.length; i += 1) {
    const prev = weeks[i - 1];
    const curr = weeks[i];
    if (prev == null || curr == null) continue;
    if (curr === prev) continue;
    if (curr === prev + 1) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

/** Średnia treningów na tydzień w oknie (domyślnie ostatnie 12 tygodni). */
export function weeklyAverage(records: ReadonlyArray<AttendanceRecord>, now: Date, weeks = 12): number {
  const fromWeek = weekIndexOf(now) - (weeks - 1);
  const inWindow = records.filter((r) => weekIndexOf(r.checkedInAt) >= fromWeek);
  return Math.round((inWindow.length / weeks) * 10) / 10;
}

export function sessionsInLastDays(records: ReadonlyArray<AttendanceRecord>, now: Date, days: number): number {
  return records.filter((r) => daysBetweenWarsaw(r.checkedInAt, now) <= days).length;
}

/** Pierwszy dzień miesiąca (00:00 czasu klubu). */
export function startOfMonthWarsaw(instant: Date | string | number): Date {
  const p = utcToWarsaw(instant);
  return warsawToUtc({ ...p, day: 1, hour: 0, minute: 0 });
}

export function sessionsThisMonth(records: ReadonlyArray<AttendanceRecord>, now: Date): number {
  const monthStart = startOfMonthWarsaw(now).getTime();
  return records.filter((r) => new Date(r.checkedInAt).getTime() >= monthStart).length;
}

/** Procent dni miesiąca (do dziś) z treningiem — wskaźnik regularności. */
export function currentMonthConsistency(records: ReadonlyArray<AttendanceRecord>, now: Date): number {
  const monthStart = startOfMonthWarsaw(now);
  const daysSoFar = daysBetweenWarsaw(monthStart, now) + 1;
  if (daysSoFar <= 0) return 0;
  const trained = new Set(
    records
      .filter((r) => new Date(r.checkedInAt).getTime() >= monthStart.getTime())
      .map((r) => warsawDayKey(new Date(r.checkedInAt)))
  );
  return Math.min(100, Math.round((trained.size / daysSoFar) * 100));
}

/** Najczęstszy dzień tygodnia, w który członek trenuje. */
export function favouriteWeekday(records: ReadonlyArray<AttendanceRecord>): number | null {
  if (records.length === 0) return null;
  const counts = new Map<number, number>();
  for (const r of records) {
    const day = warsawWeekday(new Date(r.checkedInAt));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const [day, count] of counts) {
    if (count > bestCount) {
      best = day;
      bestCount = count;
    }
  }
  return best;
}

export function daysSinceLastTraining(lastTrainingAt: string | null, now: Date): number | null {
  if (!lastTrainingAt) return null;
  return daysBetweenWarsaw(lastTrainingAt, now);
}

export function isCheckedIn(records: ReadonlyArray<AttendanceRecord>, memberId: string, sessionId: string): boolean {
  return records.some((r) => r.memberId === memberId && r.sessionId === sessionId);
}

export interface MemberStatsInput {
  readonly memberId: string;
  readonly records: ReadonlyArray<AttendanceRecord>;
  readonly templateById: Map<string, ClassTemplate>;
  /** sessionId -> classTemplateId, żeby wiedzieć, jakiego typu były zajęcia. */
  readonly sessionTemplate: Map<string, string>;
  readonly noShows: number;
  readonly now: Date;
}

export function computeMemberStats(input: MemberStatsInput): MemberStats {
  const { memberId, records, sessionTemplate, templateById, noShows, now } = input;
  const sorted = [...records].sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt));

  const byClassType = new Map<ClassType, number>();
  const byWeekday = new Map<number, number>();
  for (const record of sorted) {
    const templateId = sessionTemplate.get(record.sessionId);
    const template = templateId ? templateById.get(templateId) : undefined;
    if (template) byClassType.set(template.classType, (byClassType.get(template.classType) ?? 0) + 1);
    const weekday = warsawWeekday(new Date(record.checkedInAt));
    byWeekday.set(weekday, (byWeekday.get(weekday) ?? 0) + 1);
  }

  return {
    memberId,
    totalSessions: sorted.length,
    sessionsThisMonth: sessionsThisMonth(sorted, now),
    sessionsLast30Days: sessionsInLastDays(sorted, now, 30),
    weeklyAverage: weeklyAverage(sorted, now),
    weekStreak: weekStreak(sorted, now),
    longestWeekStreak: longestWeekStreak(sorted),
    currentMonthRatio: currentMonthConsistency(sorted, now),
    noShows,
    byClassType: [...byClassType.entries()].sort((a, b) => b[1] - a[1]),
    byWeekday: [...byWeekday.entries()].sort((a, b) => a[0] - b[0]),
    history: sorted,
    lastTrainingAt: sorted.at(-1)?.checkedInAt ?? null,
    firstTrainingAt: sorted[0]?.checkedInAt ?? null,
  };
}

/** Nagłówek sekcji statystyk: „Regularność” z komentarzem zależnym od średniej. */
export function consistencyLabel(average: number): string {
  if (average >= 4) return 'Poziom zawodnika';
  if (average >= 3) return 'Świetna regularność';
  if (average >= 2) return 'Solidny rytm';
  if (average >= 1) return 'Jest postęp';
  return 'Wskakuj częściej na matę';
}

/** Czy członek „zniknął” — nie trenował od co najmniej `threshold` dni. */
export function isInactive(lastTrainingAt: string | null, now: Date, threshold = 14): boolean {
  const days = daysSinceLastTraining(lastTrainingAt, now);
  if (days == null) return false;
  return days >= threshold;
}

/** Zagęszcza listę obecności do unikalnych osób (do licznika „kto dziś na macie”). */
export function uniqueAttendees(records: ReadonlyArray<AttendanceRecord>): string[] {
  return [...new Set(records.map((r) => r.memberId))];
}

/** Dzień (klubowy) instancji — eksportowane dla widoków grupujących po dniach. */
export function dayKeyOf(instant: Date | string | number): string {
  return warsawDayKey(typeof instant === 'string' || typeof instant === 'number' ? new Date(instant) : instant);
}

/** Pomocnicze: początek tygodnia (klubowego) dla widoków raportowych. */
export function weekStartOf(instant: Date | string | number): Date {
  return startOfWarsawWeek(instant);
}
