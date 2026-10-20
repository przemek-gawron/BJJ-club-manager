/**
 * Smoke test demo repozytorium: logowanie, frekwencja trenera i szczegóły zajęć.
 *
 * Odpala realne `demoApi` (te same funkcje domenowe co produkcyjne RPC), więc łapie
 * regresje, których nie widać w testach czystej logiki domenowej.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { demoApi } from '@/data/demo/repository';
import { buildDemoDb } from '@/data/demo/data';

/** Nadchodzące zajęcia po indeksie — różne indeksy to różne terminy. */
function upcomingSessionId(index: number): string {
  const db = buildDemoDb(new Date());
  const upcoming = db.sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.startsAt).getTime() > Date.now())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const picked = upcoming[index];
  if (!picked) throw new Error(`Brak ${index + 1}. nadchodzących zajęć w danych demo.`);
  return picked.id;
}

async function notPresentMember(sessionId: string): Promise<string> {
  const detail = await demoApi.sessionDetail(sessionId);
  const row = detail?.roster.find((r) => r.checkedInAt == null);
  if (!row) throw new Error('Brak nieobecnej osoby na liście.');
  return row.memberId;
}

describe('demo repository', () => {
  beforeAll(async () => {
    const signed = await demoApi.signIn('magda@klub.demo', 'Trening123!');
    expect(signed.ok).toBe(true);
  });

  it('trener wpisuje osobę na listę obecności', async () => {
    const sessionId = upcomingSessionId(0);
    const before = await demoApi.sessionDetail(sessionId);
    expect(before).not.toBeNull();
    const memberId = await notPresentMember(sessionId);

    const result = await demoApi.markAttendance(sessionId, memberId, true);
    expect(result.ok).toBe(true);

    const after = await demoApi.sessionDetail(sessionId);
    const row = after!.roster.find((r) => r.memberId === memberId);
    expect(row?.checkedInAt).not.toBeNull();
    expect(after!.session.attendanceCount).toBe(before!.session.attendanceCount + 1);
  });

  it('trener może wykreślić osobę z listy', async () => {
    const sessionId = upcomingSessionId(0);
    const memberId = await notPresentMember(sessionId);

    expect((await demoApi.markAttendance(sessionId, memberId, true)).ok).toBe(true);
    expect((await demoApi.markAttendance(sessionId, memberId, false)).ok).toBe(true);

    const after = await demoApi.sessionDetail(sessionId);
    expect(after!.roster.find((r) => r.memberId === memberId)?.checkedInAt).toBeNull();
  });

  it('meldunek nie przechodzi na inne zajęcia', async () => {
    const sessionId = upcomingSessionId(0);
    const otherId = upcomingSessionId(1);
    expect(otherId).not.toBe(sessionId);
    const memberId = await notPresentMember(sessionId);

    await demoApi.markAttendance(sessionId, memberId, true);

    const other = await demoApi.sessionDetail(otherId);
    expect(other!.roster.find((r) => r.memberId === memberId)?.checkedInAt).toBeNull();
  });
});
