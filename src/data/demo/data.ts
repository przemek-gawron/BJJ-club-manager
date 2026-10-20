/**
 * Dane demonstracyjne dla trybu `demo` (bez backendu).
 *
 * Odpowiednik supabase/seed.sql. Dane są generowane względem `now`, żeby
 * grafik, okna check-inu i statystyki wyglądały realistycznie w każdym dniu.
 */

import { addWarsawDays, combineWarsaw, startOfWarsawDay, warsawToUtc } from '@/lib/poland-time';
import { env } from '@/lib/env';
import { materializeSessions } from '@/domain/schedule';
import { pickSessionForCheckIn } from '@/domain/check-in';
import type {
  AttendanceRecord,
  BeltAssignment,
  Belt,
  ClassTemplate,
  MemberProfile,
  Poll,
  PollOption,
  PollVote,
  Session,
  Signup,
  SparringIntent,
  Technique,
} from '@/domain/types';

/**
 * Encje domenowe są `readonly`, a demo zapisuje w nich wyniki mutacji.
 * `Mutable` zdejmuje readonly tylko w warstwie danych, nie w domenowej.
 */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface DemoDb {
  profiles: Mutable<MemberProfile>[];
  templates: Mutable<ClassTemplate>[];
  sessions: Mutable<Session>[];
  signups: Mutable<Signup>[];
  attendance: Mutable<AttendanceRecord>[];
  noShows: { sessionId: string; memberId: string; markedAt: string }[];
  beltHistory: Mutable<BeltAssignment>[];
  techniques: Mutable<Technique>[];
  polls: Mutable<Poll>[];
  pollOptions: Mutable<PollOption>[];
  pollVotes: Mutable<PollVote>[];
  intents: Mutable<SparringIntent>[];
  clubName: string;
  checkInToken: string;
  currentUserId: string | null;
}

const iso = (d: Date) => d.toISOString();
const joinDate = (y: number, m: number, d: number) => warsawToUtc({ year: y, month: m, day: d, hour: 9, minute: 0 });

/** Deterministyczny generator — te same dane na każdym uruchomieniu. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

interface SeedPerson {
  readonly id: string;
  readonly email: string;
  readonly first: string;
  readonly last: string;
  readonly nick: string | null;
  readonly role: MemberProfile['role'];
  readonly membership: MemberProfile['membership'];
  readonly belt: Belt;
  readonly stripe: 0 | 1 | 2 | 3 | 4;
  readonly weight: number;
  readonly joined: Date;
  /** Prawdopodobieństwo obecności na zajęciach — buduje realistyczne statystyki. */
  readonly attendance: number;
}

const PEOPLE: ReadonlyArray<SeedPerson> = [
  { id: 'u-tomek', email: 'tomek@klub.demo', first: 'Tomasz', last: 'Wrona', nick: null, role: 'admin', membership: 'active', belt: 'black', stripe: 2, weight: 88, joined: joinDate(2015, 2, 2), attendance: 0.95 },
  { id: 'u-magda', email: 'magda@klub.demo', first: 'Magda', last: 'Zielińska', nick: null, role: 'coach', membership: 'active', belt: 'brown', stripe: 3, weight: 63, joined: joinDate(2017, 9, 4), attendance: 0.9 },
  { id: 'u-kuba', email: 'kuba@klub.demo', first: 'Kuba', last: 'Lewandowski', nick: 'Rakieta', role: 'member', membership: 'active', belt: 'blue', stripe: 2, weight: 82, joined: joinDate(2021, 3, 1), attendance: 0.7 },
  { id: 'u-ola', email: 'ola@klub.demo', first: 'Ola', last: 'Nowak', nick: 'Woda', role: 'member', membership: 'active', belt: 'blue', stripe: 0, weight: 61, joined: joinDate(2021, 10, 11), attendance: 0.55 },
  { id: 'u-piotr', email: 'piotr@klub.demo', first: 'Piotr', last: 'Mazur', nick: 'Góra', role: 'member', membership: 'active', belt: 'purple', stripe: 1, weight: 97, joined: joinDate(2018, 1, 15), attendance: 0.6 },
  { id: 'u-anna', email: 'anna@klub.demo', first: 'Anna', last: 'Kowalska', nick: null, role: 'member', membership: 'active', belt: 'white', stripe: 3, weight: 58, joined: joinDate(2024, 2, 19), attendance: 0.5 },
  { id: 'u-marek', email: 'marek@klub.demo', first: 'Marek', last: 'Lis', nick: 'Buldożer', role: 'member', membership: 'active', belt: 'blue', stripe: 4, weight: 91, joined: joinDate(2020, 6, 8), attendance: 0.75 },
  { id: 'u-ewa', email: 'ewa@klub.demo', first: 'Ewa', last: 'Dąbrowska', nick: null, role: 'member', membership: 'active', belt: 'white', stripe: 1, weight: 66, joined: joinDate(2025, 1, 6), attendance: 0.4 },
  { id: 'u-jakub', email: 'jakub@klub.demo', first: 'Jakub', last: 'Woźniak', nick: 'Kajak', role: 'member', membership: 'active', belt: 'blue', stripe: 0, weight: 74, joined: joinDate(2019, 11, 25), attendance: 0.65 },
  { id: 'u-karolina', email: 'karolina@klub.demo', first: 'Karolina', last: 'Kaczmarek', nick: null, role: 'member', membership: 'active', belt: 'blue', stripe: 1, weight: 59, joined: joinDate(2022, 4, 4), attendance: 0.6 },
  { id: 'u-grzegorz', email: 'grzegorz@klub.demo', first: 'Grzegorz', last: 'Zakrzewski', nick: 'Grześ', role: 'member', membership: 'active', belt: 'purple', stripe: 4, weight: 85, joined: joinDate(2016, 8, 22), attendance: 0.8 },
  { id: 'u-natalia', email: 'natalia@klub.demo', first: 'Natalia', last: 'Sikora', nick: null, role: 'member', membership: 'active', belt: 'white', stripe: 0, weight: 68, joined: joinDate(2025, 9, 8), attendance: 0.35 },
  { id: 'u-adam', email: 'adam@klub.demo', first: 'Adam', last: 'Król', nick: 'Król Maty', role: 'member', membership: 'active', belt: 'brown', stripe: 0, weight: 79, joined: joinDate(2014, 5, 12), attendance: 0.85 },
  { id: 'u-iwona', email: 'iwona@klub.demo', first: 'Iwona', last: 'Michalska', nick: null, role: 'member', membership: 'suspended', belt: 'blue', stripe: 2, weight: 64, joined: joinDate(2020, 10, 19), attendance: 0.0 },
  { id: 'u-bartek', email: 'bartek@klub.demo', first: 'Bartek', last: 'Urbański', nick: 'Barcik', role: 'member', membership: 'active', belt: 'white', stripe: 2, weight: 103, joined: joinDate(2025, 6, 2), attendance: 0.45 },
];

export const DEMO_PASSWORD = 'Trening123!';

const TEMPLATE_SEEDS: ReadonlyArray<Omit<ClassTemplate, 'id' | 'coachId'> & { coach: 'tomek' | 'magda' }> = [
  { name: 'Gi All Levels', classType: 'gi', level: 'all', weekday: 0, startTime: '19:30', durationMinutes: 75, capacity: 18, color: '#2F6FED', active: true, description: 'Trening gi dla każdego poziomu.', coach: 'tomek' },
  { name: 'No-Gi Fundamentals', classType: 'no_gi', level: 'beginners', weekday: 1, startTime: '18:30', durationMinutes: 60, capacity: 14, color: '#10B981', active: true, description: 'Fundamenty bez gi: zapasy, przejścia, ucieczki.', coach: 'magda' },
  { name: 'Zapasy i rzuty', classType: 'no_gi', level: 'intermediate', weekday: 2, startTime: '20:00', durationMinutes: 60, capacity: 12, color: '#F59E0B', active: true, description: 'Zapasnicze wejścia i rzuty.', coach: 'magda' },
  { name: 'Competition Prep', classType: 'competition', level: 'advanced', weekday: 3, startTime: '19:00', durationMinutes: 90, capacity: 10, color: '#EF4444', active: true, description: 'Przygotowanie startowe, ciężkie sparingi.', coach: 'tomek' },
  { name: 'Warunki i mobilność', classType: 'conditioning', level: 'all', weekday: 4, startTime: '07:30', durationMinutes: 45, capacity: 20, color: '#06B6D4', active: true, description: 'Rozgrzewka, mobilność, siła pod matę.', coach: 'tomek' },
  { name: 'Open Mat', classType: 'open_mat', level: 'all', weekday: 5, startTime: '11:00', durationMinutes: 90, capacity: null, color: '#8B5CF6', active: true, description: 'Wolna mata — własne tematy i sparingi.', coach: 'tomek' },
];

const TECHNIQUES: ReadonlyArray<[string, Technique['category'], string, number]> = [
  ['Guard retention', 'guard', 'obrona gardy', 21],
  ['Collar elbow tie-up', 'wrestling', 'klincz i wejścia w zapasy', 16],
  ['Single leg', 'takedowns', 'zejście do jednej nogi', 14],
  ['Back take transitions', 'submissions', 'dojścia do pleców', 13],
  ['Closed guard submissions', 'submissions', 'dźwignie z zamkniętej gardy', 12],
  ['Half guard passing', 'passing', 'przechodzenie half guard', 11],
  ['Triangle from guard', 'submissions', 'trójkąt z gardy', 10],
  ['Double leg', 'takedowns', 'zejście do dwóch nóg', 9],
  ['Knee cut pass', 'passing', 'przejście kolanem', 9],
  ['Mount escape', 'guard', 'ucieczka z boku', 8],
  ['Armbar from mount', 'submissions', 'prostowna z boku', 7],
  ['Leg lock entries', 'submissions', 'wejścia w nogi', 6],
  ["D'arce choke", 'submissions', 'duszenie d\'arce', 5],
  ['Turtle defense', 'guard', 'obrona żółwia', 4],
  ['Ankle pick defense', 'wrestling', 'obrona przed ankle pick', 3],
];

export function buildDemoDb(now: Date): DemoDb {
  const rand = seeded('bjj-club-demo');
  const today = startOfWarsawDay(now);

  const profiles: DemoDb["profiles"] = PEOPLE.map((p) => ({
    id: p.id,
    email: p.email,
    firstName: p.first,
    lastName: p.last,
    nickname: p.nick,
    role: p.role,
    membership: p.membership,
    joinedAt: p.joined.toISOString(),
    weightKg: p.weight,
    phone: p.role === 'admin' ? '+48 600 100 100' : null,
    belt: p.belt,
    stripe: p.stripe,
    beltAssignedAt: addWarsawDays(today, -Math.round(rand() * 400) - 30).toISOString(),
    avatarSeed: p.id.replace('u-', ''),
    notes: p.membership === 'suspended' ? 'Przerwa urazowa — kolano, powrót planowany.' : null,
  }));

  const coachId = (who: 'tomek' | 'magda') => (who === 'magda' ? 'u-magda' : 'u-tomek');

  const templates: DemoDb["templates"] = TEMPLATE_SEEDS.map((t, i) => ({
    ...t,
    id: `tpl-${i + 1}`,
    coachId: coachId(t.coach),
  }));

  const generated = materializeSessions(templates, now);
  const sessions: DemoDb["sessions"] = generated.map((g, i) => ({
    id: `ses-${i + 1}`,
    classTemplateId: g.classTemplateId,
    coachId: g.coachId,
    startsAt: g.startsAt,
    endsAt: g.endsAt,
    status: 'scheduled',
    cancelledReason: null,
    capacityOverride: null,
  }));

  // Odwołane jedne zajęcia w przeszłości, żeby pokazać obsługę statusu.
  const cancelled = sessions.find(
    (s) => new Date(s.endsAt).getTime() < now.getTime() && new Date(s.startsAt).getTime() > addWarsawDays(today, -10).getTime()
  );
  if (cancelled) {
    cancelled.status = 'cancelled';
    cancelled.cancelledReason = 'Choroba trenera';
  }

  const past = sessions.filter((s) => s.status === 'scheduled' && new Date(s.endsAt).getTime() < now.getTime());
  const upcoming = sessions.filter((s) => new Date(s.startsAt).getTime() >= now.getTime());

  const attendance: DemoDb["attendance"] = [];
  const signups: DemoDb["signups"] = [];
  const noShows: DemoDb['noShows'] = [];
  let counter = 0;

  const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

  for (const person of PEOPLE) {
    const member = profiles.find((p) => p.id === person.id)!;
    if (member.membership !== 'active') continue;

    for (const session of past) {
      if (rand() < person.attendance) {
        const starts = new Date(session.startsAt);
        attendance.push({
          id: nextId('att'),
          sessionId: session.id,
          memberId: person.id,
          checkedInAt: new Date(starts.getTime() + Math.round(rand() * 20) * 60_000).toISOString(),
          source: rand() < 0.85 ? 'qr' : 'coach',
          markedById: null,
          outcome: 'attended',
        });
      }
    }

    // Zapisy na nadchodzące zajęcia.
    for (const session of upcoming) {
      if (rand() < 0.35) {
        signups.push({
          id: nextId('sig'),
          sessionId: session.id,
          memberId: person.id,
          status: 'active',
          waitlistPosition: null,
          createdAt: addWarsawDays(today, -Math.round(rand() * 4)).toISOString(),
          cancelledAt: null,
        });
      }
    }
  }

  // No-show: zapisany, a nie przyszedł (historia).
  for (const session of past.slice(-14)) {
    const booked = signups.filter((s) => s.sessionId === session.id && s.status === 'active');
    for (const b of booked) {
      const came = attendance.some((a) => a.sessionId === session.id && a.memberId === b.memberId);
      if (!came) noShows.push({ sessionId: session.id, memberId: b.memberId, markedAt: session.endsAt });
    }
  }

  const beltHistory: DemoDb["beltHistory"] = profiles.map((p) => ({
    id: `bh-${p.id}`,
    memberId: p.id,
    belt: p.belt,
    stripe: p.stripe,
    assignedById: 'u-tomek',
    assignedAt: p.beltAssignedAt,
    note: 'wpis z danych demonstracyjnych',
  }));

  const techniques: DemoDb["techniques"] = TECHNIQUES.map(([name, category, description, usage], i) => ({
    id: `tec-${i + 1}`,
    name,
    category,
    classType: 'any',
    usageCount: usage,
    description,
  }));

  // ---- ankiety: jedna otwarta na najbliższe no-gi, jedna zamknięta w historii ----
  const polls: DemoDb["polls"] = [];
  const pollOptions: DemoDb["pollOptions"] = [];
  const pollVotes: DemoDb["pollVotes"] = [];

  const nextNoGi = upcoming
    .filter((s) => templates.find((t) => t.id === s.classTemplateId)?.name === 'No-Gi Fundamentals')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  if (nextNoGi) {
    const poll: Poll = {
      id: 'poll-open',
      sessionId: nextNoGi.id,
      createdBy: 'u-magda',
      status: 'open',
      closesAt: new Date(new Date(nextNoGi.startsAt).getTime() - 30 * 60_000).toISOString(),
      createdAt: addWarsawDays(today, -1).toISOString(),
      decidedOptionId: null,
    };
    polls.push(poll);
    const openLabels: ReadonlyArray<[string, string]> = [
      ['Zapasy: collar tie i single leg', 'tec-2'],
      ['Guard retention z half guard', 'tec-1'],
      ['Przejścia: knee cut i torreado', 'tec-9'],
    ];
    openLabels.forEach(([label, techId], i) => {
      pollOptions.push({
        id: `po-open-${i + 1}`,
        pollId: poll.id,
        label,
        techniqueId: techId,
        source: 'coach',
        createdById: 'u-magda',
        createdAt: poll.createdAt,
        position: i,
      });
    });

    const booked = signups.filter((s) => s.sessionId === nextNoGi.id && s.status === 'active');
    booked.forEach((b, i) => {
      const option = pollOptions[(i + (b.memberId.charCodeAt(2) % 3)) % pollOptions.length];
      if (!option) return;
      pollVotes.push({ pollId: poll.id, memberId: b.memberId, optionId: option.id, updatedAt: now.toISOString() });
    });
  }

  const lastGi = past
    .filter((s) => templates.find((t) => t.id === s.classTemplateId)?.name === 'Gi All Levels')
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];

  if (lastGi) {
    const poll: Poll = {
      id: 'poll-closed',
      sessionId: lastGi.id,
      createdBy: 'u-tomek',
      status: 'closed',
      closesAt: new Date(new Date(lastGi.startsAt).getTime() - 30 * 60_000).toISOString(),
      createdAt: addWarsawDays(new Date(lastGi.startsAt), -2).toISOString(),
      decidedOptionId: 'po-closed-1',
    };
    polls.push(poll);
    ['Back take transitions', 'Closed guard submissions', 'Single leg'].forEach((label, i) => {
      pollOptions.push({
        id: `po-closed-${i + 1}`,
        pollId: poll.id,
        label,
        techniqueId: null,
        source: 'coach',
        createdById: 'u-tomek',
        createdAt: poll.createdAt,
        position: i,
      });
    });
    const booked = signups.filter((s) => s.sessionId === lastGi.id && s.status === 'active');
    booked.forEach((b, i) => {
      const option = pollOptions.find((o) => o.pollId === poll.id && o.position === i % 3);
      if (!option) return;
      pollVotes.push({ pollId: poll.id, memberId: b.memberId, optionId: option.id, updatedAt: poll.closesAt });
    });
  }

  // ---- tablica sparingów na najbliższe zajęcia ----
  const intents: DemoDb["intents"] = [];
  const boardSession = upcoming
    .filter((s) => new Date(s.startsAt).getTime() - now.getTime() < 30 * 3_600_000)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? upcoming[0];

  if (boardSession) {
    const intensities = ['light', 'technical', 'hard'] as const;
    const focuses = ['any', 'takedowns', 'guard', 'passing', 'submissions', 'wrestling'] as const;
    for (const person of PEOPLE) {
      if (person.role !== 'member' || person.membership !== 'active') continue;
      const r = rand();
      if (r < 0.45) continue;
      intents.push({
        id: `int-${person.id}`,
        sessionId: boardSession.id,
        memberId: person.id,
        intensity: intensities[Math.floor(rand() * 3) % 3] ?? 'technical',
        focus: focuses[Math.floor(rand() * 6) % 6] ?? 'any',
        createdAt: new Date(now.getTime() - Math.round(rand() * 4) * 3_600_000).toISOString(),
      });
    }
  }

  return {
    profiles,
    templates,
    sessions,
    signups,
    attendance,
    noShows,
    beltHistory,
    techniques,
    polls,
    pollOptions,
    pollVotes,
    intents,
    clubName: 'BJJ Club Warszawa',
    // Token demo bierze się z konfiguracji, żeby aplikacja i baza demo zawsze się zgadzały.
    checkInToken: env.checkInToken,
    currentUserId: null,
  };
}

/** Sesja, do której aplikacja kieruje skan QR (bez wskazanego id w deep-linku). */
export function sessionForQr(db: DemoDb, now: Date): Session | null {
  const candidates = db.sessions
    .filter((s) => s.status === 'scheduled')
    .map((s) => ({ id: s.id, startsAt: new Date(s.startsAt), ref: s }));
  const picked = pickSessionForCheckIn(candidates, now);
  return picked?.ref ?? null;
}

/** Kolejne zajęcia tego samego szablonu o zadanej godzinie — pomocnicze w testach. */
export function startsAtFor(template: ClassTemplate, day: Date): Date {
  return combineWarsaw(day, template.startTime);
}
