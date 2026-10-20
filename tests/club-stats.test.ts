/**
 * Frekwencja klubu nie może przekroczyć 100%.
 *
 * Regresja: licznik brał WSZYSTKIE meldunki, a mianownik tylko zapisanych aktywnych.
 * Meldunek bez zapisu (walk-in) nie ma pary w mianowniku, więc zawyżał wynik — przy
 * 2 zapisanych i 22 meldunkach `club_stats` zwracał 1100, a ekran Club rysował
 * „obecność 1100%” oraz „wypisywka -1000%”. Ten sam wzór był w SQL i w demo.
 *
 * Scenariusz musi oznaczyć obecność WSZYSTKICH zapisanych: wtedy licznik == mianownik
 * i każda dodatkowa osoba bez zapisu przekracza sto procent. Przy oznaczeniu byle kogo
 * present < booked i test przechodzi niezależnie od wzoru (sam taką pułapkę przeoczyłem).
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { demoApi } from '@/data/demo/repository';

const WALK_INS_PER_SESSION = 3;

/** Osoby spoza listy zajęć — kandydaci na meldunek bez zapisu. */
async function outsidersOf(sessionId: string): Promise<string[]> {
  const detail = await demoApi.sessionDetail(sessionId);
  if (!detail) throw new Error('Nie znaleziono zajęć.');
  const onList = new Set([...detail.roster, ...detail.walkIns].map((r) => r.memberId));
  const all = await demoApi.listMembers();
  return all.filter((m) => !onList.has(m.id)).map((m) => m.id);
}

describe('frekwencja klubu', () => {
  beforeAll(async () => {
    const signed = await demoApi.signIn('magda@klub.demo', 'Trening123!');
    expect(signed.ok).toBe(true);
  });

  it('meldunki bez zapisu nie podnoszą frekwencji powyżej 100%', async () => {
    const now = new Date();
    const sessions = (await demoApi.sessionsWithClass(now, new Date(now.getTime() + 21 * 86_400_000)))
      .filter((s) => s.status === 'scheduled' && new Date(s.endsAt).getTime() > now.getTime())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 2);
    expect(sessions.length).toBe(2);

    let bookedTotal = 0;
    let walkInsExpected = 0;

    for (const session of sessions) {
      const detail = await demoApi.sessionDetail(session.id);
      const booked = (detail?.roster ?? []).filter((r) => r.status === 'active');
      expect(booked.length, `Zajęcia ${session.id} bez zapisów.`).toBeGreaterThan(0);

      // Wszyscy zapisani przyszli — licznik równa się mianownikowi.
      for (const row of booked) {
        expect((await demoApi.markAttendance(session.id, row.memberId, true)).ok).toBe(true);
      }
      bookedTotal += booked.length;

      // Dodatkowe osoby bez zapisu: w dawnym wzorze dokładały się do frekwencji.
      const outsiders = (await outsidersOf(session.id)).slice(0, WALK_INS_PER_SESSION);
      expect(outsiders.length).toBe(WALK_INS_PER_SESSION);
      for (const memberId of outsiders) {
        expect((await demoApi.markAttendance(session.id, memberId, true)).ok).toBe(true);
      }
      walkInsExpected += outsiders.length;

      expect((await demoApi.closeSession(session.id)).ok).toBe(true);
    }

    const stats = await demoApi.clubStats();

    // Sedno regresji: same walk-iny ponad stan zapisów dawały >100%.
    // Przy bookedTotal ≈ 5 i 6 osobach bez zapisu wadliwy wzór zwracał ~220.
    expect(stats.attendanceRate).toBeLessThanOrEqual(100);

    // Walk-iny zostają w raporcie — bez nich „obecność 100%” przy nadkomplecie
    // na macie byłoby niewidoczne, a niska frekwencja czytana by jako „nikt nie przyszedł”.
    expect(stats.walkIns).toBeGreaterThanOrEqual(walkInsExpected);
    expect(bookedTotal).toBeGreaterThan(0);
  });
});
