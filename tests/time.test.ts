import { describe, expect, it } from 'vitest';

import { addMinutes, formatWarsawDate, formatWarsawTime, startOfWarsawDay, startOfWarsawWeek, utcToWarsaw, warsawDayKey, warsawToUtc, warsawWeekday, addWarsawDays, offsetAtUtc, daysBetweenWarsaw, relativeDayLabel } from '@/lib/poland-time';

const ISO = (d: Date) => d.toISOString();

describe('strefa Europe/Warsaw', () => {
  it('stosuje czas zimowy (UTC+1) w styczniu', () => {
    const instant = new Date(Date.UTC(2026, 0, 15, 12, 0));
    expect(offsetAtUtc(instant.getTime())).toBe(60);
    expect(utcToWarsaw(instant).hour).toBe(13);
  });

  it('stosuje czas letni (UTC+2) w lipcu', () => {
    const instant = new Date(Date.UTC(2026, 6, 15, 12, 0));
    expect(offsetAtUtc(instant.getTime())).toBe(120);
    expect(utcToWarsaw(instant).hour).toBe(14);
  });

  it('przelicza lokalną godzinę zajęć na UTC zimą i latem', () => {
    // 19:30 w Warszawie 15 stycznia => 18:30 UTC
    expect(ISO(warsawToUtc({ year: 2026, month: 1, day: 15, hour: 19, minute: 30 }))).toBe('2026-01-15T18:30:00.000Z');
    // 19:30 w Warszawie 15 lipca => 17:30 UTC
    expect(ISO(warsawToUtc({ year: 2026, month: 7, day: 15, hour: 19, minute: 30 }))).toBe('2026-07-15T17:30:00.000Z');
  });

  it('w marcu 2026 zmiana czasu wypada w ostatnią niedzielę', () => {
    // 29 marca 2026, 01:00 UTC przechodzimy na CEST
    const before = new Date(Date.UTC(2026, 2, 29, 0, 30));
    const after = new Date(Date.UTC(2026, 2, 29, 1, 30));
    expect(offsetAtUtc(before.getTime())).toBe(60);
    expect(offsetAtUtc(after.getTime())).toBe(120);
  });

  it('październik 2026 wraca na czas zimowy w ostatnią niedzielę', () => {
    // 25 października 2026, 01:00 UTC kończymy CEST
    const before = new Date(Date.UTC(2026, 9, 25, 0, 30));
    const after = new Date(Date.UTC(2026, 9, 25, 1, 30));
    expect(offsetAtUtc(before.getTime())).toBe(120);
    expect(offsetAtUtc(after.getTime())).toBe(60);
  });

  it('godzina 02:30 w noc zmiany czasu na letni nie istnieje — przesuwa się o godzinę', () => {
    // 29 marca 2026 02:30 lokalnie nie istnieje; akceptowalne zachowanie: 01:30 UTC (=03:30 lokalnie)
    const converted = warsawToUtc({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 });
    expect(converted.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('godzina 02:30 w noc powrotu jest niejednoznaczna — bierzemy pierwszą (letnią)', () => {
    const converted = warsawToUtc({ year: 2026, month: 10, day: 25, hour: 2, minute: 30 });
    // 00:30 UTC = 02:30 CEST (pierwsze wystąpienie)
    expect(converted.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('utrzymuje lokalną godzinę zajęć przez przejście DST', () => {
    // Zajęcia w środę o 19:30 — sprawdzamy dwie najbliższe środy po zmianie czasu.
    const before = warsawToUtc({ year: 2026, month: 3, day: 25, hour: 19, minute: 30 });
    const after = addWarsawDays(before, 7);
    expect(formatWarsawTime(before)).toBe('19:30');
    expect(formatWarsawTime(after)).toBe('19:30');
    // 7 dni kalendarzowych, ale o godzinę mniej w UTC, bo przeszliśmy na CEST.
    expect(after.getTime() - before.getTime()).toBe(7 * 24 * 3_600_000 - 3_600_000);
  });

  it('addWarsawDays nie przesuwa lokalnej godziny przy zmianie czasu', () => {
    const before = warsawToUtc({ year: 2026, month: 3, day: 25, hour: 19, minute: 30 });
    const after = addWarsawDays(before, 7);
    expect(formatWarsawTime(after)).toBe('19:30');
    expect(formatWarsawDate(after)).toBe('01.04.2026');
  });

  it('poniedziałek jest dniem 0, niedziela dniem 6', () => {
    const monday = warsawToUtc({ year: 2026, month: 10, day: 19, hour: 8, minute: 0 });
    const sunday = warsawToUtc({ year: 2026, month: 10, day: 25, hour: 8, minute: 0 });
    expect(warsawWeekday(monday)).toBe(0);
    expect(warsawWeekday(sunday)).toBe(6);
  });

  it('tydzień zaczyna się w poniedziałek', () => {
    const wednesday = warsawToUtc({ year: 2026, month: 10, day: 21, hour: 20, minute: 0 });
    const weekStart = startOfWarsawWeek(wednesday);
    expect(warsawWeekday(weekStart)).toBe(0);
    expect(formatWarsawDate(weekStart)).toBe('19.10.2026');
    expect(formatWarsawTime(weekStart)).toBe('00:00');
  });

  it('północ dnia to zawsze 00:00 czasu klubu', () => {
    const instant = warsawToUtc({ year: 2026, month: 10, day: 20, hour: 23, minute: 30 });
    const day = startOfWarsawDay(instant);
    expect(formatWarsawTime(day)).toBe('00:00');
    expect(formatWarsawDate(day)).toBe('20.10.2026');
  });

  it('warsawDayKey i daysBetweenWarsaw liczą dni kalendarzowe', () => {
    const a = warsawToUtc({ year: 2026, month: 3, day: 28, hour: 23, minute: 0 });
    const b = warsawToUtc({ year: 2026, month: 3, day: 31, hour: 1, minute: 0 });
    expect(warsawDayKey(a)).toBe('2026-03-28');
    expect(daysBetweenWarsaw(a, b)).toBe(3);
  });

  it('addMinutes nie zmienia strefy', () => {
    const start = warsawToUtc({ year: 2026, month: 7, day: 15, hour: 19, minute: 30 });
    expect(formatWarsawTime(addMinutes(start, 90))).toBe('21:00');
  });

  it('relativeDayLabel opisuje dni po ludzku', () => {
    const now = warsawToUtc({ year: 2026, month: 10, day: 20, hour: 9, minute: 0 });
    expect(relativeDayLabel(now, now)).toBe('dzisiaj');
    expect(relativeDayLabel(addMinutes(now, 20 * 60), now)).toBe('jutro');
    expect(relativeDayLabel(addMinutes(now, 46 * 60), now)).toBe('pojutrze');
  });
});
