/** Profil członka: publiczna karta i pomocnicze opisy używane w wielu widokach. */

import { weightBand } from './belts';
import { daysBetweenWarsaw } from '@/lib/poland-time';
import type { MemberProfile, PublicMemberCard } from './types';

/**
 * Karta widoczna dla innych członków klubu: imię lub pseudonim, poziom, przedział masy.
 * Bez e-maila, telefonu i dokładnej wagi — te dane zostają dla trenera i admina.
 */
export function publicCardFor(member: MemberProfile, lastTrainingAt: string | null = null): PublicMemberCard {
  const nick = member.nickname?.trim();
  return {
    id: member.id,
    displayName: nick && nick.length > 0 ? nick : member.firstName,
    role: member.role,
    belt: member.belt,
    stripe: member.stripe,
    weightBand: weightBand(member.weightKg),
    joinedAt: member.joinedAt,
    avatarSeed: member.avatarSeed,
    lastTrainingAt,
  };
}

/** Staż w klubie: „1 rok 3 mies.” — używany w katalogu i na profilu. */
export function tenureLabel(joinedAt: string, now: Date): string {
  const months = Math.max(0, Math.round(daysBetweenWarsaw(joinedAt, now) / 30.44));
  if (months < 1) return 'świeżak';
  if (months < 12) return `${months} mies.`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} lat` : `${years} lat ${rest} mies.`;
}

export const MEMBERSHIP_LABEL_PL: Record<MemberProfile['membership'], string> = {
  active: 'aktywne',
  suspended: 'zawieszone',
  none: 'brak członkostwa',
};

export const ROLE_LABEL_PL: Record<MemberProfile['role'], string> = {
  member: 'członek',
  coach: 'trener',
  admin: 'admin',
};

export function isCoachOrAdmin(member: Pick<MemberProfile, 'role'>): boolean {
  return member.role === 'coach' || member.role === 'admin';
}

/** Czy członek może się zapisywać i głosować: aktywna rola + aktywne członkostwo. */
export function canTrain(member: Pick<MemberProfile, 'role' | 'membership'>): boolean {
  if (member.membership !== 'active') return false;
  return member.role === 'member' || member.role === 'coach' || member.role === 'admin';
}
