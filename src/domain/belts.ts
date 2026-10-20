/** Paski BJJ: kolejność, kreski, reprezentacja w UI i dopasowanie poziomów. */

import type { Belt, MemberProfile, StripeCount } from './types';

export const BELT_ORDER: ReadonlyArray<Belt> = ['white', 'blue', 'purple', 'brown', 'black'];

export const BELT_LABEL_PL: Record<Belt, string> = {
  white: 'biały',
  blue: 'niebieski',
  purple: 'fioletowy',
  brown: 'brązowy',
  black: 'czarny',
};

/** Kolor paska w UI (ciemny motyw, kontrastowe krawędzie). */
export const BELT_COLOR: Record<Belt, string> = {
  white: '#E8EAED',
  blue: '#2F6FED',
  purple: '#8B5CF6',
  brown: '#A16207',
  black: '#111827',
};

/** Kolor obramowania potrzebny, żeby czarny pasek był widoczny na ciemnym tle. */
export const BELT_BORDER: Record<Belt, string> = {
  white: '#9CA3AF',
  blue: '#93B4FF',
  purple: '#C4B5FD',
  brown: '#D6A64A',
  black: '#4B5563',
};

export const MAX_STRIPE: StripeCount = 4;

export function beltRank(belt: Belt): number {
  return BELT_ORDER.indexOf(belt);
}

/** Pozycja w całej ścieżce SSB (0 = biały bez kreski, 4 = biały 4 kreski, 5 = niebieski 0 ...). */
export function beltProgress(belt: Belt, stripe: StripeCount): number {
  return beltRank(belt) * (MAX_STRIPE + 1) + stripe;
}

export function beltLabel(belt: Belt, stripe: StripeCount): string {
  const label = BELT_LABEL_PL[belt];
  if (belt === 'black') return `czarny ${stripe}° dan`;
  return stripe > 0 ? `${label} +${stripe}` : label;
}

/** Przedział masy pokazywany publicznie — dokładna waga zostaje dla trenera. */
export const WEIGHT_BAND_WIDTH = 10;

export function weightBand(weightKg: number | null): string {
  if (weightKg == null) return 'masa nieznana';
  const lower = Math.floor(weightKg / WEIGHT_BAND_WIDTH) * WEIGHT_BAND_WIDTH;
  return `${lower}–${lower + WEIGHT_BAND_WIDTH - 1} kg`;
}

export function displayName(member: Pick<MemberProfile, 'firstName' | 'lastName' | 'nickname'>): string {
  const nick = member.nickname?.trim();
  if (nick && nick.length > 0) return `${member.firstName} „${nick}”`;
  return `${member.firstName} ${member.lastName}`;
}

export function initials(member: Pick<MemberProfile, 'firstName' | 'lastName'>): string {
  const a = member.firstName.charAt(0);
  const b = member.lastName.charAt(0);
  return (a + b).toUpperCase();
}

export function beltDistance(a: Belt, b: Belt): number {
  return Math.abs(beltRank(a) - beltRank(b));
}

/**
 * Czy poziom nadaje się do wspólnego sparingu.
 * Miękki limit: do 2 pasów różnicy. Różnica 2 pasów oznacza sparing „asystujący” —
 * trener zobaczy to jako ostrzeżenie, a nie twardą blokadę.
 */
export function canSparTogether(a: { belt: Belt }, b: { belt: Belt }): boolean {
  return beltDistance(a.belt, b.belt) <= 2;
}

/** Zmiana paska — walidacja, żeby nie dało się „cofnąć” lub przeskoczyć stopnia bez intencji trenera. */
export function validateBeltChange(from: { belt: Belt; stripe: StripeCount }, to: { belt: Belt; stripe: StripeCount }): {
  ok: boolean;
  message: string;
} {
  if (to.stripe < 0 || to.stripe > MAX_STRIPE) return { ok: false, message: 'Kreska musi być w zakresie 0–4.' };
  const fromProgress = beltProgress(from.belt, from.stripe);
  const toProgress = beltProgress(to.belt, to.stripe);
  if (toProgress === fromProgress) return { ok: false, message: 'Wybierz inny poziom niż aktualny.' };
  if (toProgress < fromProgress) {
    return { ok: false, message: 'Nie można obniżyć paska. Użyj notatki historycznej, jeśli to korekta błędu.' };
  }
  const sameBelt = from.belt === to.belt;
  if (sameBelt && to.stripe <= from.stripe) {
    return { ok: false, message: 'W obrębie tego samego pasa kreska może tylko rosnąć.' };
  }
  if (!sameBelt) {
    const nextRank = beltRank(from.belt) + 1;
    if (beltRank(to.belt) !== nextRank) {
      return { ok: false, message: 'Pasek można podnieść tylko o jeden stopień.' };
    }
    if (to.stripe !== 0) {
      return { ok: false, message: 'Nowy pasek zaczyna się od zera kresek.' };
    }
  }
  return { ok: true, message: 'Zmiana zapisana.' };
}
