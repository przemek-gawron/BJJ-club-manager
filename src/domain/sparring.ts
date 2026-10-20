/**
 * Tablica chętnych na sparingi + dopasowanie poziomów.
 *
 * Dopasowanie: pas (±1 to ideał), masa w przedziałach po 10 kg i staż.
 * Nie budujemy twardego filtra — twarda blokada w klubie oznacza „nikogo na macie”,
 * więc zwracamy posortowaną listę z powodami, żeby członek sam widział, dlaczego ktoś pasuje.
 */

import { beltDistance } from './belts';
import { daysBetweenWarsaw } from '@/lib/poland-time';
import type { Belt, MemberProfile, SparringCandidate, SparringFocus, SparringIntensity, SparringIntent } from './types';

/** Ważność intencji: lista dotyczy dzisiejszych zajęć, więc po 12 h ogłoszenie gaśnie. */
export const INTENT_TTL_HOURS = 12;

export function isIntentFresh(intent: Pick<SparringIntent, 'createdAt'>, now: Date): boolean {
  const ageHours = (now.getTime() - new Date(intent.createdAt).getTime()) / 3_600_000;
  return ageHours <= INTENT_TTL_HOURS;
}

export function weightDelta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b);
}

/** Staż w miesiącach — miękki sygnał doświadczenia przy tym samym pasie. */
export function tenureMonths(joinedAt: string, now: Date): number {
  return Math.max(0, Math.round(daysBetweenWarsaw(joinedAt, now) / 30.44));
}

export interface LevelInput {
  readonly belt: Belt;
  readonly weightKg: number | null;
  readonly joinedAt: string;
}

/**
 * Wynik zgodności 0-100.
 * - pas: identyczny 40, ±1 stopień 30, ±2 stopnie 8, dalej 0
 * - masa: ≤5 kg 35, ≤10 kg 28, ≤15 kg 18, ≤20 kg 8, dalej 0, brak danych 12
 * - staż: ≤6 mies. 15, ≤18 mies. 10, dalej 4
 * - zbieżny obszar pracy +5, zbieżna intensywność +5
 */
export function compatibilityScore(args: {
  readonly me: LevelInput;
  readonly other: LevelInput;
  readonly myFocus?: SparringFocus;
  readonly theirFocus?: SparringFocus;
  readonly myIntensity?: SparringIntensity;
  readonly theirIntensity?: SparringIntensity;
  readonly now: Date;
}): number {
  const { me, other, now } = args;
  let score = 0;

  const gap = beltDistance(me.belt, other.belt);
  score += gap === 0 ? 40 : gap === 1 ? 30 : gap === 2 ? 8 : 0;

  const delta = weightDelta(me.weightKg, other.weightKg);
  if (delta == null) score += 12;
  else if (delta <= 5) score += 35;
  else if (delta <= 10) score += 28;
  else if (delta <= 15) score += 18;
  else if (delta <= 20) score += 8;

  const tenureGap = Math.abs(tenureMonths(me.joinedAt, now) - tenureMonths(other.joinedAt, now));
  score += tenureGap <= 6 ? 15 : tenureGap <= 18 ? 10 : 4;

  if (focusMatches(args.myFocus, args.theirFocus)) score += 5;
  if (args.myIntensity && args.theirIntensity && args.myIntensity === args.theirIntensity) score += 5;

  return Math.min(100, score);
}

export function focusMatches(a?: SparringFocus, b?: SparringFocus): boolean {
  if (!a || !b) return false;
  return a === 'any' || b === 'any' || a === b;
}

/**
 * Lista kandydatów: każdy członek z aktualną intencją, posortowany wg zgodności.
 * `me` nigdy nie trafia na listę, podobnie jak osoby z nieaktywnym członkostwem.
 */
export function rankSparringPartners(args: {
  readonly me: MemberProfile;
  readonly members: ReadonlyArray<MemberProfile>;
  readonly intents: ReadonlyArray<SparringIntent>;
  readonly cardFor: (member: MemberProfile) => PublicMemberCard;
  readonly myIntent?: SparringIntent;
  readonly now: Date;
}): SparringCandidate[] {
  const fresh = args.intents.filter((i) => isIntentFresh(i, args.now) && i.memberId !== args.me.id);

  // Jedna aktualna intencja na osobę — liczy się najnowsza.
  const latest = new Map<string, SparringIntent>();
  for (const intent of fresh) {
    const existing = latest.get(intent.memberId);
    if (!existing || existing.createdAt < intent.createdAt) latest.set(intent.memberId, intent);
  }

  const candidates: SparringCandidate[] = [];
  for (const intent of latest.values()) {
    const member = args.members.find((m) => m.id === intent.memberId);
    if (!member || member.membership !== 'active') continue;
    const compatibility = compatibilityScore({
      me: { belt: args.me.belt, weightKg: args.me.weightKg, joinedAt: args.me.joinedAt },
      other: { belt: member.belt, weightKg: member.weightKg, joinedAt: member.joinedAt },
      myFocus: args.myIntent?.focus,
      theirFocus: intent.focus,
      myIntensity: args.myIntent?.intensity,
      theirIntensity: intent.intensity,
      now: args.now,
    });
    candidates.push({
      member: args.cardFor(member),
      intent,
      beltGap: beltDistance(args.me.belt, member.belt),
      weightDeltaKg: weightDelta(args.me.weightKg, member.weightKg),
      compatibility,
      reasons: buildReasons(args.me, member, intent, args.now),
    });
  }

  return candidates.sort(
    (a, b) => b.compatibility - a.compatibility || a.member.displayName.localeCompare(b.member.displayName, 'pl')
  );
}

function buildReasons(me: MemberProfile, other: MemberProfile, intent: SparringIntent, now: Date): string[] {
  const reasons: string[] = [];
  const gap = beltDistance(me.belt, other.belt);
  reasons.push(gap === 0 ? 'ten sam pas' : gap === 1 ? 'różnica 1 pasa' : `różnica ${gap} pasów`);

  const delta = weightDelta(me.weightKg, other.weightKg);
  reasons.push(delta == null ? 'masa nieznana' : delta <= 10 ? `masa zbliżona (±${delta} kg)` : `różnica masy ${delta} kg`);

  const tenureGap = Math.abs(tenureMonths(me.joinedAt, now) - tenureMonths(other.joinedAt, now));
  reasons.push(tenureGap <= 6 ? 'zbliżony staż' : tenureGap <= 18 ? 'staż podobny' : 'różny staż');

  reasons.push(FOCUS_LABEL[intent.focus]);
  reasons.push(INTENSITY_LABEL[intent.intensity]);
  return reasons;
}

export const INTENSITY_LABEL: Record<SparringIntensity, string> = {
  light: 'lekko',
  technical: 'technicznie',
  hard: 'mocno',
};

export const FOCUS_LABEL: Record<SparringFocus, string> = {
  any: 'cokolwiek',
  takedowns: 'rzuty',
  guard: 'garda',
  passing: 'przechodzenie',
  submissions: 'dźwignie',
  wrestling: 'zapasy',
};

export const SPARRING_INTENSITIES: ReadonlyArray<SparringIntensity> = ['light', 'technical', 'hard'];

export const SPARRING_FOCUSES: ReadonlyArray<SparringFocus> = [
  'any',
  'takedowns',
  'guard',
  'passing',
  'submissions',
  'wrestling',
];

/** Podsumowanie nagłówka tablicy: ilu ludzi szuka dziś partnera. */
export function boardSummary(candidates: ReadonlyArray<SparringCandidate>): string {
  if (candidates.length === 0) return 'Nikt teraz nie szuka partnera — dodaj swoje zgłoszenie, a ktoś się odezwie.';
  const strong = candidates.filter((c) => c.compatibility >= 70).length;
  if (strong >= 2) return `${candidates.length} osób na tablicy, w tym ${strong} świetnie dopasowanych.`;
  return `${candidates.length} ${candidates.length === 1 ? 'osoba' : 'osób'} na tablicy.`;
}
