/**
 * Strefa czasowa klubu: Europe/Warsaw.
 *
 * Nie polegamy na Intl ani na strefie telefonu — reguły DST dla Polski są zakodowane wprost,
 * dzięki czemu materializacja sesji i okna check-inu działają identycznie na urządzeniu,
 * w testach i w bazie. Wszystkie daty trzymamy w UTC, przeliczamy tylko na granicach.
 *
 * CET = UTC+1 (zimowy), CEST = UTC+2 (letni).
 * Start czasu letniego: ostatnia niedziela marca, 01:00 UTC (02:00 lokalnie -> 03:00).
 * Koniec czasu letniego: ostatnia niedziela października, 01:00 UTC (03:00 lokalnie -> 02:00).
 */

export const STANDARD_OFFSET_MIN = 60;
export const DST_OFFSET_MIN = 120;

export interface WarsawDateTime {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 — wartości poza miesiącem są normalizowane przez Date.UTC. */
  day: number;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
}

const MS_MINUTE = 60_000;

/** Instant przejścia na czas letni dla danego roku (ostatnia niedziela marca, 01:00 UTC). */
function dstStartUtc(year: number): number {
  return lastSundayUtc(year, 2, 1);
}

/** Instant powrotu na czas zimowy (ostatnia niedziela października, 01:00 UTC). */
function dstEndUtc(year: number): number {
  return lastSundayUtc(year, 9, 1);
}

function lastSundayUtc(year: number, monthIndex: number, hourUtc: number): number {
  const lastDayOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const weekdayOfLastDay = new Date(Date.UTC(year, monthIndex, lastDayOfMonth)).getUTCDay();
  const lastSunday = lastDayOfMonth - weekdayOfLastDay;
  return Date.UTC(year, monthIndex, lastSunday, hourUtc);
}

/** Offset (minuty na plus do UTC) obowiązujący w danej chwili UTC. */
export function offsetAtUtc(instantMs: number): number {
  const year = new Date(instantMs).getUTCFullYear();
  // Instant może leżeć poza rokiem, w którym „wypada” przejście, więc sprawdzamy rok i sąsiadów.
  for (const candidate of [year - 1, year, year + 1]) {
    if (instantMs >= dstStartUtc(candidate) && instantMs < dstEndUtc(candidate)) return DST_OFFSET_MIN;
  }
  return STANDARD_OFFSET_MIN;
}

/**
 * Lokalny czas warszawski -> instant UTC.
 *
 * - Godzina niejednoznaczna (powtórzona po końcu DST): zwracamy pierwsze wystąpienie, czyli letnie.
 * - Godzina nieistniejąca (skok do przodu): używamy offsetu zimowego, czyli instant przesuwa się
 *   o godzinę do przodu — dokładnie tak, jak robi to większość bibliotek strefowych.
 */
export function warsawToUtc(parts: WarsawDateTime): Date {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const withStandard = naive - STANDARD_OFFSET_MIN * MS_MINUTE;
  const withDst = naive - DST_OFFSET_MIN * MS_MINUTE;
  const standardValid = offsetAtUtc(withStandard) === STANDARD_OFFSET_MIN;
  const dstValid = offsetAtUtc(withDst) === DST_OFFSET_MIN;

  if (dstValid && standardValid) return new Date(withDst); // godzina powtórzona -> bierzemy letnią
  if (dstValid) return new Date(withDst);
  return new Date(withStandard); // w tym też przypadek luki
}

/** Rozkłada instant UTC na lokalne składowe czasu warszawskiego. */
export function utcToWarsaw(instant: Date | string | number): WarsawDateTime {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  const shifted = new Date(ms + offsetAtUtc(ms) * MS_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 0 = poniedziałek ... 6 = niedziela (tak trzymamy `class_templates.weekday`). */
export function warsawWeekday(instant: Date | string | number): number {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  const shifted = new Date(ms + offsetAtUtc(ms) * MS_MINUTE);
  return (shifted.getUTCDay() + 6) % 7;
}

export function warsawDayKey(instant: Date | string | number): string {
  const p = utcToWarsaw(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatTime(parts: Pick<WarsawDateTime, 'hour' | 'minute'>): string {
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatWarsawTime(instant: Date | string | number): string {
  return formatTime(utcToWarsaw(instant));
}

export function formatWarsawDate(instant: Date | string | number): string {
  const p = utcToWarsaw(instant);
  return `${pad(p.day)}.${pad(p.month)}.${p.year}`;
}

export function formatWarsawDateTime(instant: Date | string | number): string {
  return `${formatWarsawDate(instant)} ${formatWarsawTime(instant)}`;
}

export const WEEKDAY_NAMES_PL = ['poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'] as const;

export const WEEKDAY_SHORT_PL = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'] as const;

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES_PL[weekday] ?? '?';
}

/** Poniedziałek (00:00 czasu klubu) tygodnia, w którym leży instant. */
export function startOfWarsawWeek(instant: Date | string | number): Date {
  const startOfDay = startOfWarsawDay(instant);
  return addWarsawDays(startOfDay, -warsawWeekday(instant));
}

/** Północ czasu klubu dla dnia, w którym leży instant. */
export function startOfWarsawDay(instant: Date | string | number): Date {
  const p = utcToWarsaw(instant);
  return warsawToUtc({ ...p, hour: 0, minute: 0 });
}

/** Pierwszy dzień miesiąca (00:00 czasu klubu). */
export function startOfMonthWarsaw(instant: Date | string | number): Date {
  const p = utcToWarsaw(instant);
  return warsawToUtc({ ...p, day: 1, hour: 0, minute: 0 });
}

/** Liczba dni kalendarzowych między datami wg czasu klubu (a -> b), bez dryfu DST. */
export function daysBetweenWarsaw(from: Date | string | number, to: Date | string | number): number {
  const a = utcToWarsaw(from);
  const b = utcToWarsaw(to);
  const MS_DAY_UTC = 86_400_000;
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / MS_DAY_UTC);
}

/**
 * Przesuwa datę o N dni kalendarzowe w strefie klubu.
 * Nie można dodać N * 24 h: przy przejściu DST wyszłaby inna lokalna godzina niż „ten sam dzień tygodnia”.
 */
export function addWarsawDays(instant: Date | string | number, days: number): Date {
  const p = utcToWarsaw(instant);
  return warsawToUtc({ ...p, day: p.day + days });
}

/** Łączy dzień (z instantu) z lokalnym czasem "HH:mm" w instant UTC. */
export function combineWarsaw(instant: Date | string | number, time: string, addDaysOffset = 0): Date {
  const [hour, minute] = time.split(':');
  const p = utcToWarsaw(instant);
  return warsawToUtc({
    year: p.year,
    month: p.month,
    day: p.day + addDaysOffset,
    hour: Number(hour ?? 0),
    minute: Number(minute ?? 0),
  });
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_MINUTE);
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 24 * 60 * MS_MINUTE);
}

/** Czytelny „przedział” dla nagłówka listy: „ten tydzień”, „za 3 dni”, a dalej data. */
export function relativeDayLabel(instant: Date | string | number, now: Date): string {
  const diffDays = Math.round((startOfWarsawDay(instant).getTime() - startOfWarsawDay(now).getTime()) / (24 * 60 * MS_MINUTE));
  if (diffDays === 0) return 'dzisiaj';
  if (diffDays === 1) return 'jutro';
  if (diffDays === 2) return 'pojutrze';
  if (diffDays > 2 && diffDays < 7) return weekdayName(warsawWeekday(instant));
  return formatWarsawDate(instant);
}
