/**
 * Implementacja `ClubApi` na danych w pamięci (tryb demo).
 *
 * Wykonuje TE SAME funkcje domenowe co produkcyjne repozytorium Supabase
 * (src/domain/*), więc reguły — okno check-inu, limity z rezerwą, głosowanie,
 * paski, passa tygodniowa — są identyczne w obu trybach. Różni się tylko tym,
 * że zapisuje w tablicach zamiast w Postgresie.
 */

import { decideCheckIn, pickSessionForCheckIn } from '@/domain/check-in';
import { canManageSignup } from '@/domain/schedule';
import { assignPlace, canCancelSignup, signupStateFor } from '@/domain/signups';
import { canAddMemberSuggestion, canVote, pollStatus, tallyVotes, validateVote } from '@/domain/polls';
import { computeMemberStats, daysSinceLastTraining, isCheckedIn, weekStreak } from '@/domain/stats';
import { rankSparringPartners } from '@/domain/sparring';
import { validateBeltChange } from '@/domain/belts';
import { isCoachOrAdmin, publicCardFor } from '@/domain/members';
import { addWarsawDays, startOfWarsawDay, warsawToUtc } from '@/lib/poland-time';
import { DEMO_PASSWORD, buildDemoDb, type DemoDb } from './data';
import type { ActionResult, ClubApi, NewMemberInput, RosterRow, SparringIntentInput } from '../api';
import type {
  CheckInResult,
  ClassTemplate,
  ClubStats,
  MemberProfile,
  MemberStats,
  Poll,
  PollOption,
  PollSummary,
  PublicMemberCard,
  Session,
  SessionWithClass,
  Signup,
  SparringCandidate,
  Technique,
} from '@/domain/types';

const LATENCY_MS = 120;

let db: DemoDb | null = null;
let seq = 10_000;

const nextId = (prefix: string) => `${prefix}-${(seq += 1)}`;
const ok = (message: string, extra: Record<string, string | number | boolean> = {}): ActionResult & Record<string, unknown> => ({ ok: true, message, ...extra });
const fail = (message: string): ActionResult => ({ ok: false, message });
const delay = () => new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS));

function requireDb(): DemoDb {
  if (!db) db = buildDemoDb(new Date());
  return db;
}

/** Zawsze odświeżamy okno czasu, żeby demo nie " zestarzało się" po godzinie. */
function fresh(): DemoDb {
  db = buildDemoDb(new Date());
  return db;
}

function current(): MemberProfile {
  const store = requireDb();
  const me = store.profiles.find((p) => p.id === store.currentUserId);
  if (!me) throw new Error('Brak zalogowanego użytkownika — zaloguj się ponownie.');
  return me;
}

function templateById(store: DemoDb): Map<string, ClassTemplate> {
  return new Map(store.templates.map((t) => [t.id, t]));
}

function sessionTemplateMap(store: DemoDb): Map<string, string> {
  return new Map(store.sessions.map((s) => [s.id, s.classTemplateId]));
}

function signupsFor(store: DemoDb, sessionId: string): DemoDb['signups'] {
  return store.signups.filter((s) => s.sessionId === sessionId);
}

function attendanceFor(store: DemoDb, sessionId: string) {
  return store.attendance.filter((a) => a.sessionId === sessionId);
}

function decorate(store: DemoDb, session: Session, now: Date): SessionWithClass {
  const template = templateById(store).get(session.classTemplateId);
  if (!template) throw new Error(`Brak szablonu ${session.classTemplateId} dla sesji ${session.id}`);

  const signups = signupsFor(store, session.id);
  const active = signups.filter((s) => s.status === 'active');
  const waitlist = signups.filter((s) => s.status === 'waitlist');
  const attendance = attendanceFor(store, session.id);
  const me = store.currentUserId;
  const state = me ? signupStateFor(signups, me) : { status: null, waitlistPosition: null };
  const poll = store.polls.find((p) => p.sessionId === session.id) ?? null;
  const myVote = me ? store.pollVotes.find((v) => v.pollId === poll?.id && v.memberId === me) ?? null : null;

  const coach = store.profiles.find((p) => p.id === session.coachId);

  return {
    ...session,
    classTemplate: template,
    coachName: coach ? `${coach.firstName} ${coach.lastName}` : '—',
    signupCount: active.length,
    waitlistCount: waitlist.length,
    attendanceCount: attendance.length,
    isSignedUp: state.status === 'active',
    isWaitlisted: state.status === 'waitlist',
    isCheckedIn: me ? isCheckedIn(attendance, me, session.id) : false,
    myWaitlistPosition: state.waitlistPosition,
    pollId: poll?.id ?? null,
    pollStatus: poll ? pollStatus(poll, now) : null,
    pollClosesAt: poll?.closesAt ?? null,
    pollVotesCount: poll ? store.pollVotes.filter((v) => v.pollId === poll.id).length : 0,
    myVoteOptionId: myVote?.optionId ?? null,
  };
}

function rosterRows(store: DemoDb, sessionId: string): { roster: RosterRow[]; walkIns: RosterRow[] } {
  const signups = signupsFor(store, sessionId);
  const attendance = attendanceFor(store, sessionId);
  const roster: RosterRow[] = [];

  for (const signup of signups) {
    if (signup.status === 'cancelled') continue;
    const member = store.profiles.find((p) => p.id === signup.memberId);
    if (!member) continue;
    const record = attendance.find((a) => a.memberId === signup.memberId);
    roster.push({
      memberId: member.id,
      displayName: publicCardFor(member).displayName,
      belt: member.belt,
      stripe: member.stripe,
      weightKg: member.weightKg,
      status: signup.status,
      waitlistPosition: signup.waitlistPosition,
      checkedInAt: record?.checkedInAt ?? null,
      source: record?.source ?? null,
      isWalkIn: false,
    });
  }

  roster.sort((a, b) => {
    if (a.checkedInAt && !b.checkedInAt) return -1;
    if (!a.checkedInAt && b.checkedInAt) return 1;
    if (a.checkedInAt && b.checkedInAt) return a.checkedInAt.localeCompare(b.checkedInAt);
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0);
  });

  const walkIns: RosterRow[] = [];
  for (const record of attendance) {
    const booked = signups.some((s) => s.memberId === record.memberId && s.status !== 'cancelled');
    if (booked) continue;
    const member = store.profiles.find((p) => p.id === record.memberId);
    if (!member) continue;
    walkIns.push({
      memberId: member.id,
      displayName: publicCardFor(member).displayName,
      belt: member.belt,
      stripe: member.stripe,
      weightKg: member.weightKg,
      status: 'active',
      waitlistPosition: null,
      checkedInAt: record.checkedInAt,
      source: record.source,
      isWalkIn: true,
    });
  }

  return { roster, walkIns };
}

function summaryFor(store: DemoDb, poll: Poll, now: Date): PollSummary | null {
  const options = store.pollOptions.filter((o) => o.pollId === poll.id);
  if (options.length === 0 && poll.status === 'draft') return null;
  const votes = store.pollVotes.filter((v) => v.pollId === poll.id);
  const status = pollStatus(poll, now);
  const me = store.currentUserId;
  const myVote = me ? votes.find((v) => v.memberId === me) ?? null : null;
  const tally = tallyVotes({ options, votes, myVoteOptionId: myVote?.optionId ?? null, decidedOptionId: poll.decidedOptionId });
  const member = me ? store.profiles.find((p) => p.id === me) : null;
  const session = store.sessions.find((s) => s.id === poll.sessionId);
  const isSignedUp = me ? signupsFor(store, poll.sessionId).some((s) => s.memberId === me && s.status === 'active') : false;

  return {
    poll,
    options: tally.options,
    totalVotes: tally.totalVotes,
    winnerOptionId: tally.winnerOptionId,
    status,
    closesAt: poll.closesAt,
    canVote: member
      ? canVote({
          status,
          isSignedUp,
          membershipActive: member.membership === 'active',
          isCoachOrAdmin: isCoachOrAdmin(member),
        })
      : false,
    canSuggest: member ? canAddMemberSuggestion({ status, existingMemberSuggestions: options.filter((o) => o.source === 'member').length, isSignedUp }).ok : false,
    isCoachView: member ? isCoachOrAdmin(member) : false,
    sessionId: session?.id ?? poll.sessionId,
  };
}

function statsForMember(store: DemoDb, memberId: string, now: Date): MemberStats {
  const records = store.attendance.filter((a) => a.memberId === memberId);
  const noShows = store.noShows.filter((n) => n.memberId === memberId).length;
  return computeMemberStats({
    memberId,
    records,
    templateById: templateById(store),
    sessionTemplate: sessionTemplateMap(store),
    noShows,
    now,
  });
}

export const demoApi: ClubApi = {
  mode: 'demo',

  // ---------------------------------------------------------------- auth --
  async signIn(email, password) {
    await delay();
    const store = fresh();
    const member = store.profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase());
    if (!member) return fail('Nie ma takiego konta w klubie.');
    if (password !== DEMO_PASSWORD) return fail('Nieprawidłowe hasło (demo: Trening123!).');
    store.currentUserId = member.id;
    return ok(`Cześć, ${member.firstName}!`);
  },

  async signInAsDemo(email) {
    return demoApi.signIn(email, DEMO_PASSWORD);
  },

  async signOut() {
    await delay();
    const store = requireDb();
    store.currentUserId = null;
  },

  demoAccounts() {
    const store = requireDb();
    return store.profiles
      .filter((p) => p.role !== 'member' || p.membership === 'active')
      .slice(0, 6)
      .map((p) => ({
        label: `${p.firstName} ${p.lastName}${p.nickname ? ` (${p.nickname})` : ''}`,
        email: p.email,
        role: p.role,
      }));
  },

  async me() {
    await delay();
    const store = requireDb();
    return store.currentUserId ? store.profiles.find((p) => p.id === store.currentUserId) ?? null : null;
  },

  async updateMe(patch) {
    await delay();
    const me = current();
    const store = requireDb();
    const target = store.profiles.find((p) => p.id === me.id);
    if (!target) return fail('Nie znaleziono profilu.');
    Object.assign(target, patch);
    return ok('Zapisano zmiany.');
  },

  // -------------------------------------------------------------- klub ---
  async clubName() {
    await delay();
    return requireDb().clubName;
  },

  async checkInToken() {
    await delay();
    return requireDb().checkInToken;
  },

  async rotateCheckInToken() {
    await delay();
    const store = requireDb();
    if (current().role !== 'admin') return fail('Token zmienia tylko admin.');
    const bytes = Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));
    store.checkInToken = `club-${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    return ok('Nowy token zapisany — wydrukuj i powieś nowy kod QR.');
  },

  // ------------------------------------------------------------- grafik --
  async listTemplates() {
    await delay();
    return [...requireDb().templates];
  },

  async saveTemplate(input) {
    await delay();
    const store = requireDb();
    if (!isCoachOrAdmin(current())) return fail('Grafik zmienia tylko trener.');
    if (input.name.trim().length < 3) return fail('Nazwa zajęć jest za krótka.');

    if (input.id) {
      const target = store.templates.find((t) => t.id === input.id);
      if (!target) return fail('Nie znaleziono zajęć.');
      Object.assign(target, input, { id: target.id });
      return ok('Zaktualizowano zajęcia w grafiku.');
    }

    store.templates.push({ ...(input as Omit<ClassTemplate, 'id'>), id: nextId('tpl') });
    return ok('Dodano zajęcia do grafiku.');
  },

  async setActiveTemplate(id, active) {
    await delay();
    const store = requireDb();
    if (!isCoachOrAdmin(current())) return fail('Grafik zmienia tylko trener.');
    const target = store.templates.find((t) => t.id === id);
    if (!target) return fail('Nie znaleziono zajęć.');
    target.active = active;
    return ok(active ? 'Zajęcia wróciły do grafiku.' : 'Zajęcia wstrzymane — nowe sesje nie będą tworzone.');
  },

  async listSessions(from, to) {
    await delay();
    const store = requireDb();
    return store.sessions
      .filter((s) => new Date(s.startsAt) >= from && new Date(s.startsAt) <= to)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },

  async sessionsWithClass(from, to) {
    await delay();
    const store = requireDb();
    const now = new Date();
    return store.sessions
      .filter((s) => new Date(s.startsAt) >= from && new Date(s.startsAt) <= to)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((s) => decorate(store, s, now));
  },

  async sessionDetail(id) {
    await delay();
    const store = requireDb();
    const session = store.sessions.find((s) => s.id === id);
    if (!session) return null;
    const { roster, walkIns } = rosterRows(store, id);
    return { session: decorate(store, session, new Date()), roster, walkIns };
  },

  async cancelSession(id, reason) {
    await delay();
    const store = requireDb();
    if (!isCoachOrAdmin(current())) return fail('Odwoływać mogą tylko trenerzy.');
    const session = store.sessions.find((s) => s.id === id);
    if (!session) return fail('Nie znaleziono zajęć.');
    session.status = 'cancelled';
    session.cancelledReason = reason.trim() ? reason.trim() : null;
    const poll = store.polls.find((p) => p.sessionId === id);
    if (poll && poll.status !== 'closed') poll.status = 'closed';
    return ok('Zajęcia odwołane — status widoczny dla wszystkich.');
  },

  async closeSession(id) {
    await delay();
    const store = requireDb();
    if (!isCoachOrAdmin(current())) return fail('Zamykać mogą tylko trenerzy.');
    const session = store.sessions.find((s) => s.id === id);
    if (!session) return fail('Nie znaleziono zajęć.');
    session.status = 'finished';
    const present = new Set(attendanceFor(store, id).map((a) => a.memberId));
    for (const signup of signupsFor(store, id)) {
      if (signup.status !== 'active' || present.has(signup.memberId)) continue;
      if (store.noShows.some((n) => n.sessionId === id && n.memberId === signup.memberId)) continue;
      store.noShows.push({ sessionId: id, memberId: signup.memberId, markedAt: new Date().toISOString() });
    }
    return ok('Zajęcia zamknięte, nieobecności zapisane.');
  },

  async syncSchedule() {
    await delay();
    const before = requireDb().sessions.length;
    db = null;
    const after = requireDb().sessions.length;
    return ok(`Grafik zsynchronizowany (${after - before > 0 ? `+${after - before}` : 'bez zmian'} sesji).`);
  },

  // ------------------------------------------------------------ zapisy ---
  async join(sessionId) {
    await delay();
    const store = requireDb();
    const me = current();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) return fail('Nie znaleziono zajęć.');

    const gate = canManageSignup(session, new Date());
    if (!gate.ok) return fail(gate.message);
    if (me.membership !== 'active') return fail('Aktywuj członkostwo, żeby zapisywać się na zajęcia.');

    const existing = signupsFor(store, sessionId).find((s) => s.memberId === me.id && s.status !== 'cancelled');
    if (existing) return fail('Jesteś już zapisany na te zajęcia.');

    const active = signupsFor(store, sessionId).filter((s) => s.status === 'active').length;
    const waitlist = signupsFor(store, sessionId).filter((s) => s.status === 'waitlist').length;
    const template = templateById(store).get(session.classTemplateId);
    const result = assignPlace({
      activeCount: active,
      waitlistCount: waitlist,
      capacity: session.capacityOverride ?? template?.capacity ?? null,
    });

    store.signups.push({
      id: nextId('sig'),
      sessionId,
      memberId: me.id,
      status: result.status,
      waitlistPosition: result.waitlistPosition,
      createdAt: new Date().toISOString(),
      cancelledAt: null,
    });
    return ok(result.message, { kind: result.status, position: result.waitlistPosition ?? 0 });
  },

  async leave(sessionId) {
    await delay();
    const store = requireDb();
    const me = current();
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) return fail('Nie znaleziono zajęć.');
    const gate = canCancelSignup(session, new Date());
    if (!gate.ok) return fail(gate.message);

    const signup = signupsFor(store, sessionId).find((s) => s.memberId === me.id && s.status !== 'cancelled');
    if (!signup) return fail('Nie masz zapisu na te zajęcia.');

    const wasActive = signup.status === 'active';
    signup.status = 'cancelled';
    signup.cancelledAt = new Date().toISOString();
    signup.waitlistPosition = null;

    let promoted = 0;
    if (wasActive) {
      const template = templateById(store).get(session.classTemplateId);
      const capacity = session.capacityOverride ?? template?.capacity ?? null;
      const active = signupsFor(store, sessionId).filter((s) => s.status === 'active').length;
      const free = capacity == null ? 0 : capacity - active;
      const waitlist = signupsFor(store, sessionId)
        .filter((s) => s.status === 'waitlist')
        .sort((a, b) => (a.waitlistPosition ?? 99) - (b.waitlistPosition ?? 99));
      for (const s of waitlist.slice(0, Math.max(0, free))) {
        s.status = 'active';
        s.waitlistPosition = null;
        promoted += 1;
      }
      waitlist
        .filter((s) => s.status === 'waitlist')
        .forEach((s, i) => {
          s.waitlistPosition = i + 1;
        });
    }

    return ok(promoted > 0 ? 'Zapis anulowany — miejsce przeszło na osobę z rezerwy.' : 'Zapis anulowany.', { promoted });
  },

  // --------------------------------------------------------- frekwencja --
  async checkIn(token, sessionId) {
    await delay();
    const store = requireDb();
    const me = current();
    const now = new Date();

    if (me.membership !== 'active') {
      return { kind: 'membership_inactive', ok: false, message: 'Masz zawieszone członkostwo — zgłoś się do zarządu.', session: null } satisfies CheckInResult;
    }
    if (token !== store.checkInToken) {
      return { kind: 'bad_token', ok: false, message: 'Ten kod QR nie należy do naszego klubu.', session: null } satisfies CheckInResult;
    }

    const candidates = store.sessions
      .filter((s) => s.status === 'scheduled')
      .map((s) => ({ id: s.id, startsAt: new Date(s.startsAt), ref: s }));

    const target = sessionId
      ? candidates.find((c) => c.id === sessionId)?.ref
      : pickSessionForCheckIn(candidates, now)?.ref;

    if (!target) {
      return {
        kind: 'no_session_in_window',
        ok: false,
        message: 'Brak zajęć w tym terminie. Zajrzyj do grafiku albo poproś trenera.',
        session: null,
      } satisfies CheckInResult;
    }

    const template = templateById(store).get(target.classTemplateId);
    const already = isCheckedIn(store.attendance, me.id, target.id);
    const decision = decideCheckIn({
      now,
      startsAt: new Date(target.startsAt),
      alreadyCheckedIn: already,
      className: template?.name ?? 'zajęć',
    });

    if (decision.kind === 'checked_in') {
      store.attendance.push({
        id: nextId('att'),
        sessionId: target.id,
        memberId: me.id,
        checkedInAt: now.toISOString(),
        source: 'qr',
        markedById: null,
        outcome: 'attended',
      });
      store.noShows = store.noShows.filter((n) => !(n.sessionId === target.id && n.memberId === me.id));
    }

    return {
      kind: decision.kind,
      ok: decision.ok,
      message: decision.message,
      session: decorate(store, target, now),
    } satisfies CheckInResult;
  },

  async markAttendance(sessionId, memberId, present) {
    await delay();
    const store = requireDb();
    if (!isCoachOrAdmin(current())) return fail('Dopisywać mogą tylko trenerzy.');
    if (present) {
      if (isCheckedIn(store.attendance, memberId, sessionId)) return fail('Ta osoba jest już na liście obecności.');
      store.attendance.push({
        id: nextId('att'),
        sessionId,
        memberId,
        checkedInAt: new Date().toISOString(),
        source: 'coach',
        markedById: current().id,
        outcome: 'attended',
      });
      store.noShows = store.noShows.filter((n) => !(n.sessionId === sessionId && n.memberId === memberId));
      return ok('Dopisano na listę obecności.');
    }
    store.attendance = store.attendance.filter((a) => !(a.sessionId === sessionId && a.memberId === memberId));
    return ok('Usunięto z listy obecności.');
  },

  async todaysAttendance() {
    await delay();
    const store = requireDb();
    const todayStart = startOfWarsawDay(new Date()).getTime();
    const todayEnd = addWarsawDays(new Date(startOfWarsawDay(new Date())), 1).getTime();
    const ids = new Set(store.sessions.filter((s) => { const t = new Date(s.startsAt).getTime(); return t >= todayStart && t < todayEnd; }).map((s) => s.id));
    return store.attendance.filter((a) => ids.has(a.sessionId));
  },

  // ------------------------------------------------------------ ankiety --
  async techniques() {
    await delay();
    return [...requireDb().techniques].sort((a, b) => b.usageCount - a.usageCount);
  },

  async pollFor(sessionId) {
    await delay();
    const store = requireDb();
    const poll = store.polls.find((p) => p.sessionId === sessionId);
    if (!poll) return null;
    return { poll, options: store.pollOptions.filter((o) => o.pollId === poll.id) };
  },

  async pollSummary(sessionId) {
    await delay();
    const store = requireDb();
    const poll = store.polls.find((p) => p.sessionId === sessionId);
    if (!poll) return null;
    return summaryFor(store, poll, new Date());
  },

  async publishPoll(sessionId, labels, techniqueIds) {
    await delay();
    const store = requireDb();
    const me = current();
    if (!isCoachOrAdmin(me)) return fail('Ankiety publikują tylko trenerzy.');
    const session = store.sessions.find((s) => s.id === sessionId);
    if (!session) return fail('Nie znaleziono zajęć.');
    if (labels.length < 2) return fail('Dodaj co najmniej 2 propozycje.');
    if (labels.length > 6) return fail('Maksymalnie 6 propozycji w jednej ankiecie.');

    let poll = store.polls.find((p) => p.sessionId === sessionId);
    if (poll?.status === 'closed') return fail('Ankieta po tych zajęciach jest zamknięta.');

    const closesAt = new Date(new Date(session.startsAt).getTime() - 30 * 60_000).toISOString();
    if (!poll) {
      poll = {
        id: nextId('poll'),
        sessionId,
        createdBy: me.id,
        status: 'open',
        closesAt,
        createdAt: new Date().toISOString(),
        decidedOptionId: null,
      };
      store.polls.push(poll);
    } else {
      poll.status = 'open';
      poll.closesAt = closesAt;
      poll.decidedOptionId = null;
      store.pollOptions = store.pollOptions.filter((o) => o.pollId !== poll!.id);
      store.pollVotes = store.pollVotes.filter((v) => v.pollId !== poll!.id);
    }

    labels.forEach((label, i) => {
      const option: PollOption = {
        id: nextId('po'),
        pollId: poll!.id,
        label: label.trim(),
        techniqueId: techniqueIds[i] ?? null,
        source: 'coach',
        createdById: me.id,
        createdAt: new Date().toISOString(),
        position: i,
      };
      store.pollOptions.push(option);
      const techId = techniqueIds[i];
      if (techId) {
        const tech = store.techniques.find((t) => t.id === techId);
        if (tech) tech.usageCount += 1;
      }
    });

    return ok('Ankieta opublikowana — członkowie mogą głosować.', { pollId: poll.id });
  },

  async addPollSuggestion(pollId, label) {
    await delay();
    const store = requireDb();
    const me = current();
    const poll = store.polls.find((p) => p.id === pollId);
    if (!poll) return fail('Nie znaleziono ankiety.');

    const options = store.pollOptions.filter((o) => o.pollId === pollId);
    const isSignedUp = signupsFor(store, poll.sessionId).some((s) => s.memberId === me.id && s.status === 'active');
    const gate = canAddMemberSuggestion({
      status: pollStatus(poll, new Date()),
      existingMemberSuggestions: options.filter((o) => o.source === 'member').length,
      isSignedUp,
    });
    if (!gate.ok) return fail(gate.message);
    if (label.trim().length < 3) return fail('Opisz propozycję krótko i konkretnie.');

    store.pollOptions.push({
      id: nextId('po'),
      pollId,
      label: label.trim(),
      techniqueId: null,
      source: 'member',
      createdById: me.id,
      createdAt: new Date().toISOString(),
      position: options.length,
    });
    return ok('Dodano twoją propozycję — zachęć innych do głosu.');
  },

  async vote(pollId, optionId) {
    await delay();
    const store = requireDb();
    const me = current();
    const poll = store.polls.find((p) => p.id === pollId);
    if (!poll) return fail('Nie znaleziono ankiety.');

    const status = pollStatus(poll, new Date());
    const isSignedUp = signupsFor(store, poll.sessionId).some((s) => s.memberId === me.id && s.status === 'active');
    const gate = validateVote({
      status,
      optionBelongsToPoll: store.pollOptions.some((o) => o.id === optionId && o.pollId === pollId),
      isSignedUp,
      membershipActive: me.membership === 'active',
      isCoachOrAdmin: isCoachOrAdmin(me),
    });
    if (!gate.ok) return fail(gate.message);

    const existing = store.pollVotes.find((v) => v.pollId === pollId && v.memberId === me.id);
    if (existing) {
      existing.optionId = optionId;
      existing.updatedAt = new Date().toISOString();
    } else {
      store.pollVotes.push({ pollId, memberId: me.id, optionId, updatedAt: new Date().toISOString() });
    }
    return ok('Głos zapisany.');
  },

  async decidePoll(pollId, optionId) {
    await delay();
    const store = requireDb();
    if (!isCoachOrAdmin(current())) return fail('Decyzję podejmuje trener.');
    const poll = store.polls.find((p) => p.id === pollId);
    if (!poll) return fail('Nie znaleziono ankiety.');
    if (!store.pollOptions.some((o) => o.id === optionId && o.pollId === pollId)) return fail('Ta propozycja nie należy do ankiety.');
    poll.decidedOptionId = optionId;
    poll.status = 'closed';
    return ok('Wynik zatwierdzony.');
  },

  // ---------------------------------------------------------- członkowie -
  async listMembers() {
    await delay();
    const store = requireDb();
    const lastOf = (memberId: string) =>
      store.attendance.filter((a) => a.memberId === memberId).map((a) => a.checkedInAt).sort().at(-1) ?? null;
    return store.profiles
      .map((p) => publicCardFor(p, lastOf(p.id)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pl'));
  },

  async memberCard(id) {
    await delay();
    const store = requireDb();
    const member = store.profiles.find((p) => p.id === id);
    if (!member) return null;
    const last = store.attendance.filter((a) => a.memberId === id).map((a) => a.checkedInAt).sort().at(-1) ?? null;
    return publicCardFor(member, last);
  },

  async memberDetail(id) {
    await delay();
    const store = requireDb();
    const member = store.profiles.find((p) => p.id === id);
    if (!member) return null;
    return {
      member,
      stats: statsForMember(store, id, new Date()),
      beltHistory: store.beltHistory.filter((b) => b.memberId === id).sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)),
    };
  },

  async assignBelt(memberId, belt, stripe, note) {
    await delay();
    const store = requireDb();
    const me = current();
    if (!isCoachOrAdmin(me)) return fail('Paski nadaje tylko trener lub admin.');
    const member = store.profiles.find((p) => p.id === memberId);
    if (!member) return fail('Nie znaleziono członka.');

    const gate = validateBeltChange({ belt: member.belt, stripe: member.stripe }, { belt, stripe });
    if (!gate.ok) return fail(gate.message);

    store.beltHistory.push({
      id: nextId('bh'),
      memberId,
      belt,
      stripe,
      assignedById: me.id,
      assignedAt: new Date().toISOString(),
      note,
    });
    member.belt = belt;
    member.stripe = stripe;
    member.beltAssignedAt = new Date().toISOString();
    return ok('Zmiana zapisana w historii pasków.');
  },

  async setMembership(memberId, status) {
    await delay();
    const store = requireDb();
    if (!isCoachOrAdmin(current())) return fail('Członkostwo zmienia trener lub admin.');
    const member = store.profiles.find((p) => p.id === memberId);
    if (!member) return fail('Nie znaleziono członka.');
    member.membership = status;
    return ok('Status członkostwa zaktualizowany.');
  },

  async createMember(input: NewMemberInput) {
    await delay();
    const store = requireDb();
    const me = current();
    if (me.role !== 'admin') return fail('Konta tworzy tylko admin.');
    if (store.profiles.some((p) => p.email.toLowerCase() === input.email.trim().toLowerCase())) {
      return fail('Takie konto już istnieje.');
    }
    const id = nextId('u');
    store.profiles.push({
      id,
      email: input.email.trim().toLowerCase(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      nickname: null,
      role: input.role,
      membership: 'active',
      joinedAt: new Date().toISOString(),
      weightKg: input.weightKg,
      phone: null,
      belt: input.belt,
      stripe: 0,
      beltAssignedAt: new Date().toISOString(),
      avatarSeed: id,
      notes: null,
    });
    store.beltHistory.push({
      id: nextId('bh'),
      memberId: id,
      belt: input.belt,
      stripe: 0,
      assignedById: me.id,
      assignedAt: new Date().toISOString(),
      note: 'konto utworzone przez admina',
    });
    return ok('Konto utworzone.', { memberId: id });
  },

  // ------------------------------------------------- tablica sparingów ---
  async sparringBoard(sessionId): Promise<SparringCandidate[]> {
    await delay();
    const store = requireDb();
    const me = current();
    const lastOf = (memberId: string) =>
      store.attendance.filter((a) => a.memberId === memberId).map((a) => a.checkedInAt).sort().at(-1) ?? null;
    const intents = store.intents.filter((i) => i.sessionId === sessionId);
    const myIntent = intents.find((i) => i.memberId === me.id);

    return rankSparringPartners({
      me,
      members: store.profiles,
      intents,
      cardFor: (m) => publicCardFor(m, lastOf(m.id)),
      myIntent,
      now: new Date(),
    });
  },

  async setSparringIntent({ sessionId, intensity, focus }: SparringIntentInput) {
    await delay();
    const store = requireDb();
    const me = current();
    const existing = store.intents.find((i) => i.sessionId === sessionId && i.memberId === me.id);
    if (existing) {
      existing.intensity = intensity;
      existing.focus = focus;
      existing.createdAt = new Date().toISOString();
      return ok('Zgłoszenie odświeżone.');
    }
    store.intents.push({
      id: nextId('int'),
      sessionId,
      memberId: me.id,
      intensity,
      focus,
      createdAt: new Date().toISOString(),
    });
    return ok('Jesteś na tablicy — inni Cię zobaczą.');
  },

  async clearSparringIntent(sessionId) {
    await delay();
    const store = requireDb();
    const me = current();
    store.intents = store.intents.filter((i) => !(i.sessionId === sessionId && i.memberId === me.id));
    return ok('Zgłoszenie usunięte z tablicy.');
  },

  // --------------------------------------------------------- statystyki --
  async memberStats(memberId) {
    await delay();
    const store = requireDb();
    return statsForMember(store, memberId, new Date());
  },

  async clubStats(): Promise<ClubStats> {
    await delay();
    const store = requireDb();
    const now = new Date();
    const held = store.sessions.filter((s) => s.status !== 'scheduled');
    const perSession = store.sessions.map((s) => attendanceFor(store, s.id).length).filter((n) => n > 0);
    const bookedActive = store.signups.filter((s) => s.status === 'active' && held.some((h) => h.id === s.sessionId)).length;
    const presentHeld = store.attendance.filter((a) => held.some((h) => h.id === a.sessionId)).length;

    const byWeekday = new Map<number, number>();
    const byHour = new Map<number, number>();
    const byType = new Map<string, number>();
    const templates = templateById(store);
    for (const record of store.attendance) {
      const d = new Date(record.checkedInAt);
      const weekday = (d.getDay() + 6) % 7;
      byWeekday.set(weekday, (byWeekday.get(weekday) ?? 0) + 1);
      byHour.set(d.getHours(), (byHour.get(d.getHours()) ?? 0) + 1);
      const templateId = store.sessions.find((s) => s.id === record.sessionId)?.classTemplateId;
      const type = templateId ? templates.get(templateId)?.classType : undefined;
      if (type) byType.set(type, (byType.get(type) ?? 0) + 1);
    }

    const cards = new Map<string, PublicMemberCard>();
    const lastOf = (memberId: string) =>
      store.attendance.filter((a) => a.memberId === memberId).map((a) => a.checkedInAt).sort().at(-1) ?? null;
    for (const p of store.profiles) cards.set(p.id, publicCardFor(p, lastOf(p.id)));

    const leaderboard = store.profiles
      .filter((p) => p.membership === 'active')
      .map((p) => {
        const records = store.attendance.filter((a) => a.memberId === p.id);
        const last30 = records.filter((a) => (daysSinceLastTraining(a.checkedInAt, now) ?? 999) <= 30).length;
        return { member: publicCardFor(p, lastOf(p.id)), sessions30Days: last30, weekStreak: weekStreak(records, now) };
      })
      .filter((row) => row.sessions30Days > 0)
      .sort((a, b) => b.sessions30Days - a.sessions30Days)
      .slice(0, 10);

    const inactive = store.profiles
      .filter((p) => p.membership === 'active' && p.role === 'member')
      .map((p) => ({ member: publicCardFor(p, lastOf(p.id)), daysSinceLastTraining: daysSinceLastTraining(lastOf(p.id), now) }))
      .filter((row): row is { member: PublicMemberCard; daysSinceLastTraining: number } => row.daysSinceLastTraining !== null && row.daysSinceLastTraining >= 14)
      .sort((a, b) => b.daysSinceLastTraining - a.daysSinceLastTraining)
      .slice(0, 10);

    const todayStart = startOfWarsawDay(now).getTime();
    const todayEnd = addWarsawDays(new Date(todayStart), 1).getTime();
    const todayIds = new Set(
      store.sessions.filter((s) => { const t = new Date(s.startsAt).getTime(); return t >= todayStart && t < todayEnd; }).map((s) => s.id)
    );

    return {
      totalMembers: store.profiles.length,
      activeMembers: store.profiles.filter((p) => p.membership === 'active').length,
      sessionsHeld: held.length,
      averageAttendance: perSession.length ? Math.round((perSession.reduce((a, b) => a + b, 0) / perSession.length) * 10) / 10 : 0,
      attendanceRate: bookedActive ? Math.round((presentHeld / bookedActive) * 100) : 0,
      noShows: store.noShows.length,
      checkInsToday: store.attendance.filter((a) => todayIds.has(a.sessionId)).length,
      attendanceByWeekday: [...byWeekday.entries()].sort((a, b) => a[0] - b[0]),
      attendanceByHour: [...byHour.entries()].sort((a, b) => a[0] - b[0]),
      attendanceByClassType: [...byType.entries()].sort((a, b) => b[1] - a[1]) as ClubStats['attendanceByClassType'],
      mostCoveredTechniques: [...store.techniques].sort((a, b) => b.usageCount - a.usageCount).slice(0, 6).map((t) => [t.name, t.usageCount] as const),
      leaderboard,
      inactiveMembers: inactive.map((i) => ({ member: i.member, daysSinceLastTraining: i.daysSinceLastTraining })),
    };
  },
};

/** Sesja, do której kierujemy skan QR, gdy deep-link nie zawiera id sesji. */
export function demoQrSession(): Session | null {
  const store = requireDb();
  const now = new Date();
  const candidates = store.sessions
    .filter((s) => s.status === 'scheduled')
    .map((s) => ({ id: s.id, startsAt: new Date(s.startsAt), ref: s }));
  return pickSessionForCheckIn(candidates, now)?.ref ?? null;
}

export function demoPollFor(sessionId: string): { poll: Poll; options: PollOption[] } | null {
  const store = requireDb();
  const poll = store.polls.find((p) => p.sessionId === sessionId);
  if (!poll) return null;
  return { poll, options: store.pollOptions.filter((o) => o.pollId === poll.id) };
}

export function demoTechniqueById(id: string): Technique | undefined {
  return requireDb().techniques.find((t) => t.id === id);
}

/** Pomocnicze do testów manualnych: konkretna godzina w dniu klubu. */
export function demoTime(hour: number, minute: number): Date {
  return warsawToUtc({ year: 2026, month: 10, day: 20, hour, minute });
}
