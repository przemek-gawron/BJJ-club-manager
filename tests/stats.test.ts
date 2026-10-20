import { describe, expect, it } from 'vitest';

import {
  computeMemberStats,
  currentMonthConsistency,
  daysSinceLastTraining,
  isInactive,
  longestWeekStreak,
  sessionsThisMonth,
  weekStreak,
  weeklyAverage,
} from '@/domain/stats';
import { materializeSessions } from '@/domain/schedule';
import { formatWarsawTime, warsawToUtc } from '@/lib/poland-time';
import type { AttendanceRecord, ClassTemplate } from '@/domain/types';

const warsaw = (year: number, month: number, day: number, hour = 19, minute = 30) =>
  warsawToUtc({ year, month, day, hour, minute }).toISOString();

const rec = (memberId: string, iso: string): AttendanceRecord => ({
  id: `${memberId}-${iso}`,
  sessionId: 'sess-' + iso.slice(0, 10),
  memberId,
  checkedInAt: iso,
  source: 'qr',
  markedById: null,
  outcome: 'attended',
});

const now = warsawToUtc({ year: 2026, month: 10, day: 20, hour: 9, minute: 0 }); // wtorek

describe('passa tygodniowa', () => {
  it('liczy kolejne tygodnie z treningiem', () => {
    const records = [
      rec('m', warsaw(2026, 10, 20)), // bieżący tydzień (wt)
      rec('m', warsaw(2026, 10, 15)), // poprzedni tydzień (czw)
      rec('m', warsaw(2026, 10, 8)), // dwa tygodnie wstecz
    ];
    expect(weekStreak(records, now)).toBe(3);
  });

  it('bieżący tydzień bez treningu nie przerywa passy', () => {
    const records = [rec('m', warsaw(2026, 10, 15)), rec('m', warsaw(2026, 10, 8))];
    expect(weekStreak(records, now)).toBe(2);
  });

  it('przerwany tydzień zeruje passę', () => {
    const records = [rec('m', warsaw(2026, 10, 20)), rec('m', warsaw(2026, 10, 1))]; // luka 12-18.10
    expect(weekStreak(records, now)).toBe(1);
  });

  it('zero treningów to zero passy', () => {
    expect(weekStreak([], now)).toBe(0);
  });

  it('najdłuższa passa nie zależy od dziś', () => {
    const records = [
      rec('m', warsaw(2026, 6, 2)),
      rec('m', warsaw(2026, 6, 9)),
      rec('m', warsaw(2026, 6, 16)),
      rec('m', warsaw(2026, 8, 4)),
    ];
    expect(longestWeekStreak(records)).toBe(3);
    expect(weekStreak(records, now)).toBe(0);
  });

  it('dwa treningi w jednym tygodniu liczą się jako jeden tydzień', () => {
    const records = [rec('m', warsaw(2026, 10, 19)), rec('m', warsaw(2026, 10, 21))];
    expect(weekStreak(records, now)).toBe(1);
  });
});

describe('średnia i bieżący miesiąc', () => {
  it('średnia z 12 tygodni zaokrągla do 0,1', () => {
    const dense = Array.from({ length: 13 }, (_, i) => rec(`m${i}`, warsaw(2026, 10, 19)));
    // 13 treningów w oknie 12 tygodni => 1,1 na tydzień
    expect(weeklyAverage(dense, now)).toBe(1.1);
  });

  it('treningi sprzed okna nie wchodzą do średniej', () => {
    const old = Array.from({ length: 20 }, () => rec('m', warsaw(2025, 1, 8)));
    expect(weeklyAverage(old, now)).toBe(0);
  });

  it('liczy treningi bieżącego miesiąca', () => {
    const records = [rec('m', warsaw(2026, 10, 1)), rec('m', warsaw(2026, 10, 20)), rec('m', warsaw(2026, 9, 30))];
    expect(sessionsThisMonth(records, now)).toBe(2);
  });

  it('regularność miesiąca to procent dni z treningiem', () => {
    const records = [rec('m', warsaw(2026, 10, 19)), rec('m', warsaw(2026, 10, 20))];
    // 2 dni z 20 dni miesiąca do dziś => 10%
    expect(currentMonthConsistency(records, now)).toBe(10);
  });
});

describe('kto zniknął', () => {
  it('liczy dni od ostatniego treningu', () => {
    expect(daysSinceLastTraining(warsaw(2026, 10, 10), now)).toBe(10);
    expect(daysSinceLastTraining(null, now)).toBeNull();
  });

  it('oznacza nieobecność od 14 dni', () => {
    expect(isInactive(warsaw(2026, 10, 6), now)).toBe(true);
    expect(isInactive(warsaw(2026, 10, 10), now)).toBe(false);
  });
});

describe('zbiorcze statystyki membera', () => {
  const template: ClassTemplate = {
    id: 't1',
    name: 'No-Gi',
    classType: 'no_gi',
    level: 'all',
    weekday: 1,
    startTime: '19:30',
    durationMinutes: 60,
    capacity: 12,
    color: '#2F6FED',
    coachId: 'c1',
    active: true,
    description: null,
  };

  it('agreguje po typie klasy i dniu tygodnia', () => {
    const records = [rec('m', warsaw(2026, 10, 20)), rec('m', warsaw(2026, 10, 15))];
    const sessionTemplate = new Map<string, string>(records.map((r) => [r.sessionId, 't1']));
    const stats = computeMemberStats({
      memberId: 'm',
      records,
      templateById: new Map([[template.id, template]]),
      sessionTemplate,
      noShows: 2,
      now,
    });
    expect(stats.totalSessions).toBe(2);
    expect(stats.byClassType).toEqual([['no_gi', 2]]);
    expect(stats.noShows).toBe(2);
    expect(stats.lastTrainingAt).toBe(warsaw(2026, 10, 20));
    expect(stats.firstTrainingAt).toBe(warsaw(2026, 10, 15));
  });
});

describe('materializacja grafiku', () => {
  const template: ClassTemplate = {
    id: 't-gi',
    name: 'Gi All Levels',
    classType: 'gi',
    level: 'all',
    weekday: 2,
    startTime: '20:00',
    durationMinutes: 75,
    capacity: 15,
    color: '#8B5CF6',
    coachId: 'c1',
    active: true,
    description: null,
  };

  it('generuje jedno zajęcia w każdym pasującym tygodniu', () => {
    const sessions = materializeSessions([template], now, 21, 21);
    // 21 dni wstecz + dziś + 21 dni naprzód = 43 dni, środy wypadają 6 albo 7 razy.
    expect(sessions.length).toBeGreaterThanOrEqual(6);
    expect(sessions.length).toBeLessThanOrEqual(7);
    // Okno 21 dni wokół 20.10 obejmuje zmianę czasu (25.10), więc UTC się różni,
    // ale lokalna godzina zajęć musi zostać ta sama.
    expect(new Set(sessions.map((s) => formatWarsawTime(new Date(s.startsAt))))).toEqual(new Set(['20:00']));
  });

  it('utrzymuje lokalną godzinę 20:00 po obu stronach zmiany czasu', () => {
    const dstBoundary = warsawToUtc({ year: 2026, month: 3, day: 26, hour: 9, minute: 0 });
    const sessions = materializeSessions([template], dstBoundary, 10, 10);
    const localHours = new Set(sessions.map((s) => new Date(s.startsAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hour12: false })));
    expect(localHours.size).toBe(1);
    expect([...localHours][0]).toBe('20:00');
  });

  it('pomija nieaktywne szablony', () => {
    expect(materializeSessions([{ ...template, active: false }], now, 7, 7)).toEqual([]);
  });

  it('nie duplikuje sesji o tym samym starcie', () => {
    const sessions = materializeSessions([template, { ...template }], now, 7, 7);
    const keys = new Set(sessions.map((s) => s.key));
    expect(keys.size).toBe(sessions.length);
  });

  it('sortuje sesje rosnąco', () => {
    const sessions = materializeSessions([template], now, 30, 30);
    const times = sessions.map((s) => new Date(s.startsAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
