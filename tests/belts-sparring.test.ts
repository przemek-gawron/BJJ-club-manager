import { describe, expect, it } from 'vitest';

import { beltLabel, beltProgress, beltRank, canSparTogether, displayName, initials, validateBeltChange, weightBand } from '@/domain/belts';
import { compatibilityScore, isIntentFresh, rankSparringPartners, tenureMonths } from '@/domain/sparring';
import { publicCardFor } from '@/domain/members';
import type { Belt, MemberProfile, SparringIntent } from '@/domain/types';
import { warsawToUtc } from '@/lib/poland-time';

const now = warsawToUtc({ year: 2026, month: 10, day: 20, hour: 19, minute: 0 });

const member = (over: Partial<MemberProfile>): MemberProfile => ({
  id: 'id',
  email: 'a@b.c',
  firstName: 'Anna',
  lastName: 'Kowalska',
  nickname: null,
  role: 'member',
  membership: 'active',
  joinedAt: warsawToUtc({ year: 2024, month: 2, day: 1, hour: 9, minute: 0 }).toISOString(),
  weightKg: 72,
  phone: null,
  belt: 'blue',
  stripe: 2,
  beltAssignedAt: warsawToUtc({ year: 2025, month: 5, day: 1, hour: 9, minute: 0 }).toISOString(),
  avatarSeed: 'anna',
  notes: null,
  ...over,
});

describe('paski', () => {
  it('kolejność pasów rośnie', () => {
    const order: Belt[] = ['white', 'blue', 'purple', 'brown', 'black'];
    expect(order.map(beltRank)).toEqual([0, 1, 2, 3, 4]);
  });

  it('kreski przesuwają pozycję o 1', () => {
    expect(beltProgress('white', 4) - beltProgress('white', 0)).toBe(4);
    expect(beltProgress('blue', 0)).toBe(5);
  });

  it('opis paska po polsku', () => {
    expect(beltLabel('white', 0)).toBe('biały');
    expect(beltLabel('blue', 3)).toBe('niebieski +3');
    expect(beltLabel('black', 2)).toBe('czarny 2° dan');
  });

  it('przedział masy obejmuje 10 kg', () => {
    expect(weightBand(72)).toBe('70–79 kg');
    expect(weightBand(80)).toBe('80–89 kg');
    expect(weightBand(null)).toBe('masa nieznana');
  });

  it('pseudonim jest pokazywany w imieniu', () => {
    expect(displayName(member({ nickname: 'Rakieta' }))).toBe('Anna „Rakieta”');
    expect(displayName(member({ nickname: '  ' }))).toBe('Anna Kowalska');
    expect(initials(member({}))).toBe('AK');
  });
});

describe('walidacja zmiany paska', () => {
  it('pozwala dodać kreskę', () => {
    expect(validateBeltChange({ belt: 'blue', stripe: 1 }, { belt: 'blue', stripe: 2 }).ok).toBe(true);
  });

  it('pozwala podnieść pas na zero kresek', () => {
    expect(validateBeltChange({ belt: 'blue', stripe: 4 }, { belt: 'purple', stripe: 0 }).ok).toBe(true);
  });

  it('blokuje obniżenie paska', () => {
    const r = validateBeltChange({ belt: 'purple', stripe: 0 }, { belt: 'blue', stripe: 4 });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('obniżyć');
  });

  it('blokuje przeskok o dwa pasy', () => {
    expect(validateBeltChange({ belt: 'white', stripe: 4 }, { belt: 'purple', stripe: 0 }).ok).toBe(false);
  });

  it('blokuje nowy pas z kreskami', () => {
    expect(validateBeltChange({ belt: 'blue', stripe: 0 }, { belt: 'purple', stripe: 1 }).ok).toBe(false);
  });

  it('blokuje kreskę wstecz w obrębie pasa', () => {
    expect(validateBeltChange({ belt: 'blue', stripe: 3 }, { belt: 'blue', stripe: 1 }).ok).toBe(false);
  });
});

describe('dobór partnera do sparingu', () => {
  const intent = (memberId: string, over: Partial<SparringIntent> = {}): SparringIntent => ({
    id: `i-${memberId}`,
    sessionId: 's1',
    memberId,
    intensity: 'technical',
    focus: 'guard',
    createdAt: now.toISOString(),
    ...over,
  });

  it('ten sam pas i masa daje najwyższy wynik', () => {
    const me = member({ id: 'me' });
    const same = member({ id: 'same', belt: 'blue', stripe: 2, weightKg: 73 });
    const far = member({ id: 'far', belt: 'brown', stripe: 0, weightKg: 105 });
    const sSame = compatibilityScore({ me, other: same, now });
    const sFar = compatibilityScore({ me, other: far, now });
    expect(sSame).toBeGreaterThan(sFar);
    expect(sSame).toBeGreaterThanOrEqual(85);
  });

  it('masa wpływa bardziej niż staż', () => {
    const me = member({ id: 'me', weightKg: 70 });
    const close = member({ id: 'close', weightKg: 72 });
    const heavy = member({ id: 'heavy', weightKg: 100 });
    expect(compatibilityScore({ me, other: close, now })).toBeGreaterThan(compatibilityScore({ me, other: heavy, now }));
  });

  it('brak masy nie zeruje wyniku', () => {
    const me = member({ id: 'me', weightKg: null });
    const other = member({ id: 'o', weightKg: null });
    expect(compatibilityScore({ me, other, now })).toBeGreaterThan(50);
  });

  it('intencja starsza niż 12 h gaśnie', () => {
    expect(isIntentFresh(intent('m', { createdAt: warsawToUtc({ year: 2026, month: 10, day: 20, hour: 8, minute: 0 }).toISOString() }), now)).toBe(true);
    expect(isIntentFresh(intent('m', { createdAt: warsawToUtc({ year: 2026, month: 10, day: 19, hour: 18, minute: 0 }).toISOString() }), now)).toBe(false);
  });

  it('lista nie zawiera mnie ani osób z nieaktywnym członkostwem', () => {
    const me = member({ id: 'me' });
    const suspended = member({ id: 'suspend', membership: 'suspended' });
    const active = member({ id: 'active' });
    const list = rankSparringPartners({
      me,
      members: [me, suspended, active],
      intents: [intent('me'), intent('suspend'), intent('active')],
      cardFor: (m) => publicCardFor(m),
      now,
    });
    expect(list.map((c) => c.member.id)).toEqual(['active']);
  });

  it('sortuje malejąco po zgodności i zwraca powody', () => {
    const me = member({ id: 'me', weightKg: 70 });
    const close = member({ id: 'close', weightKg: 71 });
    const heavy = member({ id: 'heavy', weightKg: 110 });
    const list = rankSparringPartners({
      me,
      members: [me, close, heavy],
      intents: [intent('heavy'), intent('close')],
      cardFor: (m) => publicCardFor(m),
      now,
    });
    expect(list[0]?.member.id).toBe('close');
    expect(list[0]?.reasons.length).toBeGreaterThan(2);
    expect(list[0]?.reasons.some((r) => r.includes('pas'))).toBe(true);
  });

  it('bierze najnowszą intencję tej samej osoby', () => {
    const me = member({ id: 'me' });
    const other = member({ id: 'other' });
    const list = rankSparringPartners({
      me,
      members: [me, other],
      intents: [
        intent('other', { focus: 'wrestling', createdAt: warsawToUtc({ year: 2026, month: 10, day: 20, hour: 12, minute: 0 }).toISOString() }),
        intent('other', { focus: 'guard', createdAt: warsawToUtc({ year: 2026, month: 10, day: 20, hour: 17, minute: 0 }).toISOString() }),
      ],
      cardFor: (m) => publicCardFor(m),
      now,
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.intent.focus).toBe('guard');
  });
});

describe('prywatność karty członka', () => {
  it('karta publiczna nie zawiera e-maila, telefonu ani dokładnej masy', () => {
    const card = publicCardFor(member({ email: 'anna@klub.pl', phone: '600100200', weightKg: 72 }));
    const json = JSON.stringify(card);
    expect(json).not.toContain('anna@klub.pl');
    expect(json).not.toContain('600100200');
    expect(json).not.toContain('72');
    expect(card.weightBand).toBe('70–79 kg');
  });

  it('staż w miesiącach liczy się od dołączenia', () => {
    expect(tenureMonths(warsawToUtc({ year: 2026, month: 8, day: 20, hour: 9, minute: 0 }).toISOString(), now)).toBe(2);
    expect(tenureMonths(warsawToUtc({ year: 2024, month: 2, day: 1, hour: 9, minute: 0 }).toISOString(), now)).toBe(33);
  });

  it('sparing dozwolony do 2 pasów różnicy', () => {
    expect(canSparTogether({ belt: 'white' }, { belt: 'blue' })).toBe(true);
    expect(canSparTogether({ belt: 'white' }, { belt: 'purple' })).toBe(true);
    expect(canSparTogether({ belt: 'white' }, { belt: 'black' })).toBe(false);
  });
});
