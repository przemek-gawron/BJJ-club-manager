/**
 * Produkcyjna implementacja `ClubApi` na Supabase.
 *
 * Reguły biznesowe wykonują funkcje RPC (SECURITY DEFINER) — klient tylko je woła.
 * Mapowania wierszy na typy domenowe są jawne, bez `any`.
 */

import { canVote, pollStatus } from '@/domain/polls';
import { isCoachOrAdmin, publicCardFor } from '@/domain/members';
import { addWarsawDays, startOfWarsawDay } from '@/lib/poland-time';
import { getSupabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import type {
  ActionResult,
  ClubApi,
  NewMemberInput,
  RosterRow,
  SparringIntentInput,
} from '../api';
import type {
  AttendanceRecord,
  Belt,
  BeltAssignment,
  CheckInResult,
  ClassTemplate,
  ClubStats,
  MemberProfile,
  MemberStats,
  Poll,
  PollOption,
  PollSummary,
  Session,
  SessionWithClass,
  StripeCount,
  Technique,
} from '@/domain/types';

/** Klient Supabasa tworzony leniwie — patrz src/lib/supabase.ts. */
function db() {
  return getSupabase();
}

type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type TemplateRow = Database['public']['Tables']['class_templates']['Row'];
type SessionRow = Database['public']['Tables']['sessions']['Row'];
type SessionViewRow = Database['public']['Views']['sessions_with_class']['Row'];
type RosterViewRow = Database['public']['Views']['session_roster']['Row'];
type WalkInViewRow = Database['public']['Views']['session_walk_ins']['Row'];
type MemberPublicRow = Database['public']['Views']['members_public']['Row'];
type BeltRow = Database['public']['Tables']['belt_history']['Row'];
type TechniqueRow = Database['public']['Tables']['techniques']['Row'];
type AttendanceRow = Database['public']['Tables']['attendance']['Row'];

/** Odpowiedź z RPC: check_in_qr, join_session itd. zwracają jsonb. */
interface RpcResult {
  ok?: boolean;
  message?: string;
  kind?: string;
  position?: number;
  promoted?: number;
  session_id?: string;
  token?: string;
  poll_id?: string;
  user_id?: string;
}

function result(value: unknown, fallback: string): ActionResult {
  const r = (value ?? {}) as RpcResult;
  return { ok: Boolean(r.ok), message: r.message ?? (r.ok ? 'Gotowe.' : fallback) };
}

function toProfile(row: ProfileRow): MemberProfile {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    nickname: row.nickname,
    role: row.role,
    membership: row.membership_status,
    joinedAt: row.joined_at,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    phone: row.phone,
    belt: row.belt,
    stripe: row.stripe as StripeCount,
    beltAssignedAt: row.belt_assigned_at,
    avatarSeed: row.avatar_seed,
    notes: row.notes,
  };
}

function toTemplate(row: TemplateRow): ClassTemplate {
  return {
    id: row.id,
    name: row.name,
    classType: row.class_type,
    level: row.level,
    weekday: row.weekday,
    startTime: row.start_time.slice(0, 5),
    durationMinutes: row.duration_minutes,
    capacity: row.capacity,
    color: row.color,
    coachId: row.coach_id,
    active: row.active,
    description: row.description,
  };
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    classTemplateId: row.class_template_id,
    coachId: row.coach_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    cancelledReason: row.cancelled_reason,
    capacityOverride: row.capacity_override,
  };
}

function toSessionView(row: SessionViewRow, template: ClassTemplate): SessionWithClass {
  return {
    id: row.id,
    classTemplateId: row.class_template_id,
    coachId: row.coach_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    cancelledReason: row.cancelled_reason,
    capacityOverride: row.capacity_override,
    classTemplate: template,
    coachName: row.coach_name,
    signupCount: row.signup_count,
    waitlistCount: row.waitlist_count,
    attendanceCount: row.attendance_count,
    isSignedUp: row.is_signed_up,
    isWaitlisted: row.my_waitlist_position != null,
    myWaitlistPosition: row.my_waitlist_position,
    isCheckedIn: row.is_checked_in,
    pollId: row.poll_id,
    pollStatus: row.poll_status,
    pollClosesAt: row.poll_closes_at,
    pollVotesCount: row.poll_votes_count,
    myVoteOptionId: row.my_vote_option_id,
  };
}

function toRoster(row: RosterViewRow): RosterRow {
  return {
    memberId: row.member_id,
    displayName: row.display_name,
    belt: row.belt,
    stripe: row.stripe as StripeCount,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    status: row.status,
    waitlistPosition: row.waitlist_position,
    checkedInAt: row.checked_in_at,
    source: row.attendance_source,
    isWalkIn: false,
  };
}

function toWalkIn(row: WalkInViewRow): RosterRow {
  return {
    memberId: row.member_id,
    displayName: row.display_name,
    belt: row.belt,
    stripe: row.stripe as StripeCount,
    weightKg: null,
    status: 'active',
    waitlistPosition: null,
    checkedInAt: row.checked_in_at,
    source: row.source,
    isWalkIn: true,
  };
}

function toAttendance(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    memberId: row.member_id,
    checkedInAt: row.checked_in_at,
    source: row.source,
    markedById: row.marked_by,
    outcome: row.outcome,
  };
}

function toBelt(row: BeltRow): BeltAssignment {
  return {
    id: row.id,
    memberId: row.member_id,
    belt: row.belt,
    stripe: row.stripe as StripeCount,
    assignedById: row.assigned_by,
    assignedAt: row.assigned_at,
    note: row.note,
  };
}

function toTechnique(row: TechniqueRow): Technique {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Technique['category'],
    classType: row.class_type ?? 'any',
    usageCount: row.usage_count,
  };
}

async function rpc<T = unknown>(fn: keyof Database['public']['Functions'], args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn as never, args as never);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function loadTemplates(): Promise<Map<string, ClassTemplate>> {
  const { data, error } = await db().from('class_templates').select('*');
  if (error) throw new Error(`class_templates: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id, toTemplate(row)]));
}

/** Widok zwraca już policzone wartości; dokładamy tylko domknięty stan ankiety. */
async function supabase_detail(id: string) {
  return db().from('sessions_with_class').select('*').eq('id', id).maybeSingle();
}

async function loadSessionView(from: Date, to: Date): Promise<SessionWithClass[]> {
  const templates = await loadTemplates();
  const { data, error } = await db()
    .from('sessions_with_class')
    .select('*')
    .gte('starts_at', from.toISOString())
    .lte('starts_at', to.toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`sessions_with_class: ${error.message}`);

  const rows = data ?? [];
  const out: SessionWithClass[] = [];
  for (const row of rows) {
    const template = templates.get(row.class_template_id);
    if (!template) continue;
    out.push(toSessionView(row, template));
  }
  return out;
}

export const supabaseApi: ClubApi = {
  mode: 'supabase',

  // ---------------------------------------------------------------- auth --
  async signIn(email, password) {
    const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, message: /invalid login credentials/i.test(error.message) ? 'Zły e-mail lub hasło.' : error.message };
    return { ok: true, message: 'Zalogowano.' };
  },

  async signOut() {
    await db().auth.signOut();
  },

  async me() {
    const { data, error } = await db().auth.getUser();
    if (error || !data.user) return null;
    const { data: row, error: profileError } = await db().from('profiles').select('*').eq('id', data.user.id).maybeSingle();
    if (profileError || !row) return null;
    return toProfile(row);
  },

  async updateMe(patch) {
    const { data, error } = await db().auth.getUser();
    if (!data.user) return { ok: false, message: 'Nie jesteś zalogowany.' };
    const { error: updateError } = await db()
      .from('profiles')
      .update({
        first_name: patch.firstName,
        last_name: patch.lastName,
        nickname: patch.nickname,
        weight_kg: patch.weightKg,
        phone: patch.phone,
        notes: patch.notes,
      })
      .eq('id', data.user.id);
    if (updateError) return { ok: false, message: updateError.message };
    return { ok: true, message: 'Zapisano zmiany.' };
  },

  // -------------------------------------------------------------- klub ---
  async clubName() {
    const { data, error } = await db().from('club_settings').select('name').eq('id', 1).maybeSingle();
    if (error || !data) return 'BJJ Club';
    return data.name;
  },

  async checkInToken() {
    const { data, error } = await db().from('club_settings').select('checkin_token').eq('id', 1).maybeSingle();
    if (error || !data) throw new Error('Brak ustawień klubu — sprawdz migracje.');
    return data.checkin_token;
  },

  async rotateCheckInToken() {
    return result(await rpc('rotate_checkin_token', {}), 'Nie udało się wygenerować nowego tokenu.');
  },

  // ------------------------------------------------------------- grafik --
  async listTemplates() {
    const templates = await loadTemplates();
    return [...templates.values()].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  },

  async saveTemplate(input) {
    const payload = {
      name: input.name,
      class_type: input.classType,
      level: input.level,
      weekday: input.weekday,
      start_time: input.startTime,
      duration_minutes: input.durationMinutes,
      capacity: input.capacity,
      color: input.color,
      coach_id: input.coachId,
      active: input.active,
      description: input.description,
    };
    if (input.id) {
      const { error } = await db().from('class_templates').update(payload).eq('id', input.id);
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: 'Zaktualizowano zajęcia w grafiku.' };
    }
    const { error } = await db().from('class_templates').insert(payload);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Dodano zajęcia do grafiku.' };
  },

  async setActiveTemplate(id, active) {
    const { error } = await db().from('class_templates').update({ active }).eq('id', id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: active ? 'Zajęcia wróciły do grafiku.' : 'Zajęcia wstrzymane.' };
  },

  async listSessions(from, to) {
    const { data, error } = await db()
      .from('sessions')
      .select('*')
      .gte('starts_at', from.toISOString())
      .lte('starts_at', to.toISOString())
      .order('starts_at', { ascending: true });
    if (error) throw new Error(`sessions: ${error.message}`);
    return (data ?? []).map(toSession);
  },

  sessionsWithClass: loadSessionView,

  async sessionDetail(id) {
    const templates = await loadTemplates();
    const { data, error } = await supabase_detail(id);
    if (error) throw new Error(`sessions_with_class: ${error.message}`);
    const row = data ?? null;
    const template = row ? templates.get(row.class_template_id) : undefined;
    if (!row || !template) return null;
    const session = toSessionView(row as SessionViewRow, template);

    const [{ data: rosterRows, error: rosterError }, { data: walkInRows, error: walkInError }] = await Promise.all([
      db().from('session_roster').select('*').eq('session_id', id),
      db().from('session_walk_ins').select('*').eq('session_id', id),
    ]);
    if (rosterError) throw new Error(`session_roster: ${rosterError.message}`);
    if (walkInError) throw new Error(`session_walk_ins: ${walkInError.message}`);

    return {
      session,
      roster: (rosterRows ?? []).map(toRoster),
      walkIns: (walkInRows ?? []).map(toWalkIn),
    };
  },

  async cancelSession(id, reason) {
    return result(await rpc('cancel_session', { p_session: id, p_reason: reason }), 'Nie udało się odwołać.');
  },

  async closeSession(id) {
    return result(await rpc('close_session', { p_session: id }), 'Nie udało się zamknąć zajęć.');
  },

  async syncSchedule() {
    return result(await rpc('materialize_sessions', {}), 'Nie udało się zsynchronizować grafiku.');
  },

  // ------------------------------------------------------------ zapisy ---
  async join(sessionId) {
    return result(await rpc('join_session', { p_session: sessionId }), 'Nie udało się zapisać.');
  },

  async leave(sessionId) {
    return result(await rpc('leave_session', { p_session: sessionId }), 'Nie udało się anulować zapisu.');
  },

  // --------------------------------------------------------- frekwencja --
  async checkIn(token, sessionId) {
    const value = (await rpc('check_in_qr', { p_token: token, p_session: sessionId ?? null })) as RpcResult;
    const message = value.message ?? 'Nie udało się zameldować.';
    let session: SessionWithClass | null = null;
    if (value.session_id) {
      const rows = await loadSessionView(addWarsawDays(new Date(), -3), addWarsawDays(new Date(), 3));
      session = rows.find((s) => s.id === value.session_id) ?? null;
    }
    return {
      kind: (value.kind as CheckInResult['kind']) ?? 'no_session_in_window',
      ok: Boolean(value.ok),
      message,
      session,
    };
  },

  async markAttendance(sessionId, memberId, present) {
    return result(await rpc('coach_mark_attendance', { p_session: sessionId, p_member: memberId, p_present: present }), 'Nie udało się zaktualizować listy.');
  },

  async todaysAttendance() {
    const from = startOfWarsawDay(new Date());
    const to = addWarsawDays(from, 1);
    const { data, error } = await db().from('sessions').select('id').gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString());
    if (error) throw new Error(`sessions: ${error.message}`);
    const ids = (data ?? []).map((s) => s.id);
    if (ids.length === 0) return [];
    const { data: rows, error: attendanceError } = await db()
      .from('attendance')
      .select('*')
      .in('session_id', ids)
      .order('checked_in_at', { ascending: true });
    if (attendanceError) throw new Error(`attendance: ${attendanceError.message}`);
    return (rows ?? []).map(toAttendance);
  },

  // ------------------------------------------------------------ ankiety --
  async techniques() {
    const { data, error } = await db().from('techniques').select('*').order('usage_count', { ascending: false });
    if (error) throw new Error(`techniques: ${error.message}`);
    return (data ?? []).map(toTechnique);
  },

  async pollFor(sessionId) {
    const { data: poll, error } = await db()
      .from('polls')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error || !poll) return null;
    if (!poll) return null;
    const row = poll;
    const { data: options, error: optionsError } = await db()
      .from('poll_options')
      .select('*')
      .eq('poll_id', row.id)
      .order('position', { ascending: true });
    if (optionsError) throw new Error(`poll_options: ${optionsError.message}`);
    return {
      poll: {
        id: row.id,
        sessionId: row.session_id,
        createdBy: row.created_by,
        status: row.status,
        closesAt: row.closes_at,
        createdAt: row.created_at,
        decidedOptionId: row.decided_option_id,
      },
      options: (options ?? []).map(toPollOption),
    };
  },

  async pollSummary(sessionId) {
    const found = await supabaseApi.pollFor(sessionId);
    if (!found) return null;
    const { data: results, error } = await db().rpc('poll_results', { p_poll: found.poll.id });
    if (error) throw new Error(`poll_results: ${error.message}`);

    const session = (await loadSessionView(addWarsawDays(new Date(), -120), addWarsawDays(new Date(), 120))).find((s) => s.id === sessionId);
    const me = await supabaseApi.me();
    const now = new Date();
    const status = pollStatus(found.poll, now);
    const rows = (results ?? []) as ReadonlyArray<{ option_id: string; label: string; source: 'coach' | 'member'; votes: number; total_votes: number; rank: number; is_winner: boolean }>;
    const optionById = new Map(found.options.map((o) => [o.id, o]));

    return {
      poll: found.poll,
      sessionId,
      options: rows.map((r) => ({
        option: optionById.get(r.option_id) ?? { ...(found.options.find((o) => o.id === r.option_id) as PollOption), label: r.label },
        votes: r.votes,
        isWinner: r.is_winner,
        myVote: session?.myVoteOptionId === r.option_id,
      })),
      totalVotes: rows[0]?.total_votes ?? 0,
      winnerOptionId: rows.find((r) => r.is_winner)?.option_id ?? null,
      canVote:
        me != null &&
        canVote({
          status,
          isSignedUp: Boolean(session?.isSignedUp),
          membershipActive: me.membership === 'active',
          isCoachOrAdmin: isCoachOrAdmin(me),
        }),
      canSuggest: status === 'open' && Boolean(session?.isSignedUp),
      isCoachView: me ? isCoachOrAdmin(me) : false,
      closesAt: found.poll.closesAt,
      status,
    } satisfies PollSummary;
  },

  async publishPoll(sessionId, labels, techniqueIds) {
    return result(
      await rpc('publish_poll', { p_session: sessionId, p_options: [...labels], p_technique_ids: techniqueIds.map((t) => t ?? '') }),
      'Nie udało się opublikować ankiety.'
    );
  },

  async addPollSuggestion(pollId, label) {
    return result(await rpc('add_poll_suggestion', { p_poll: pollId, p_label: label }), 'Nie udało się dodać propozycji.');
  },

  async vote(pollId, optionId) {
    return result(await rpc('cast_vote', { p_poll: pollId, p_option: optionId }), 'Nie udało się zapisać głosu.');
  },

  async decidePoll(pollId, optionId) {
    return result(await rpc('decide_poll', { p_poll: pollId, p_option: optionId }), 'Nie udało się zatwierdzić wyniku.');
  },

  // ---------------------------------------------------------- członkowie -
  async listMembers() {
    const { data, error } = await db().from('members_public').select('*').order('display_name');
    if (error) throw new Error(`members_public: ${error.message}`);
    return (data ?? []).map((row) => toPublicCard(row));
  },

  async memberCard(id) {
    const { data, error } = await db().from('members_public').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return toPublicCard(data);
  },

  async memberDetail(id) {
    const [{ data: profileRow, error: profileError }, stats, { data: beltRows, error: beltError }] = await Promise.all([
      db().from('profiles').select('*').eq('id', id).maybeSingle(),
      supabaseApi.memberStats(id),
      db().from('belt_history').select('*').eq('member_id', id).order('assigned_at', { ascending: false }),
    ]);
    if (profileError || !profileRow) return null;
    if (beltError) throw new Error(`belt_history: ${beltError.message}`);
    return {
      member: toProfile(profileRow),
      stats,
      beltHistory: (beltRows ?? []).map(toBelt),
    };
  },

  async assignBelt(memberId, belt, stripe, note) {
    return result(await rpc('assign_belt', { p_member: memberId, p_belt: belt, p_stripe: stripe, p_note: note }), 'Nie udało się zapisać zmiany paska.');
  },

  async setMembership(memberId, status) {
    return result(await rpc('set_membership', { p_member: memberId, p_status: status }), 'Nie udało się zmienić statusu.');
  },

  async createMember(input: NewMemberInput) {
    return result(
      await rpc('admin_create_member', {
        p_email: input.email,
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_role: input.role,
        p_initial_password: input.initialPassword ?? null,
        p_belt: input.belt,
        p_weight_kg: input.weightKg,
      }),
      'Nie udało się utworzyć konta.'
    );
  },

  // ------------------------------------------------- tablica sparingów ---
  async sparringBoard(sessionId) {
    const [{ data: intentRows, error: intentsError }, members] = await Promise.all([
      db().from('sparring_intents').select('*').eq('session_id', sessionId),
      supabaseApi.listMembers(),
    ]);
    if (intentsError) throw new Error(`sparring_intents: ${intentsError.message}`);

    const me = await supabaseApi.me();
    if (!me) return [];

    const { data: profileRows, error: profilesError } = await db().from('profiles').select('*');
    if (profilesError) throw new Error(`profiles: ${profilesError.message}`);
    const profiles = (profileRows ?? []).map(toProfile);
    const cardById = new Map(members.map((m) => [m.id, m]));

    const { rankSparringPartners } = await import('@/domain/sparring');
    return rankSparringPartners({
      me,
      members: profiles,
      intents: (intentRows ?? []).map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        memberId: r.member_id,
        intensity: r.intensity,
        focus: r.focus,
        createdAt: r.created_at,
      })),
      cardFor: (m) => cardById.get(m.id) ?? publicCardFor(m),
      myIntent: (() => {
        const mine = (intentRows ?? []).find((r) => r.member_id === me.id);
        return mine
          ? {
              id: mine.id,
              sessionId: mine.session_id,
              memberId: mine.member_id,
              intensity: mine.intensity,
              focus: mine.focus,
              createdAt: mine.created_at,
            }
          : undefined;
      })(),
      now: new Date(),
    });
  },

  async setSparringIntent({ sessionId, intensity, focus }: SparringIntentInput) {
    const { data, error } = await db().auth.getUser();
    if (!data.user) return { ok: false, message: 'Nie jesteś zalogowany.' };
    const { error: upsertError } = await db()
      .from('sparring_intents')
      .upsert({ session_id: sessionId, member_id: data.user.id, intensity, focus, created_at: new Date().toISOString() }, { onConflict: 'session_id,member_id' });
    if (upsertError) return { ok: false, message: upsertError.message };
    return { ok: true, message: 'Jesteś na tablicy — inni Cię zobaczą.' };
  },

  async clearSparringIntent(sessionId) {
    const { data, error } = await db().auth.getUser();
    if (!data.user) return { ok: false, message: 'Nie jesteś zalogowany.' };
    const { error: deleteError } = await db().from('sparring_intents').delete().eq('session_id', sessionId).eq('member_id', data.user.id);
    if (deleteError) return { ok: false, message: deleteError.message };
    return { ok: true, message: 'Zgłoszenie usunięte z tablicy.' };
  },

  // --------------------------------------------------------- statystyki --
  async memberStats(memberId) {
    const value = (await rpc('member_stats', { p_member: memberId })) as Partial<MemberStats> & Record<string, unknown>;
    const byType = (value.by_class_type ?? []) as ReadonlyArray<ReadonlyArray<string>>;
    const byDay = (value.by_weekday ?? []) as ReadonlyArray<ReadonlyArray<number>>;
    return {
      memberId,
      totalSessions: Number(value.total_sessions ?? 0),
      sessionsThisMonth: Number(value.sessions_this_month ?? 0),
      sessionsLast30Days: Number(value.sessions_last_30_days ?? 0),
      weeklyAverage: Number(value.weekly_average ?? 0),
      weekStreak: Number(value.week_streak ?? 0),
      longestWeekStreak: Number(value.week_streak ?? 0),
      currentMonthRatio: Number(value.current_month_ratio ?? 0),
      noShows: Number(value.no_shows ?? 0),
      byClassType: byType.map(([k, v]) => [k as ClassTemplate['classType'], Number(v)] as const),
      byWeekday: byDay.map(([k, v]) => [Number(k), Number(v)] as const),
      history: [],
      lastTrainingAt: (value.last_training_at as string | null) ?? null,
      firstTrainingAt: (value.first_training_at as string | null) ?? null,
    };
  },

  async clubStats() {
    const value = (await rpc('club_stats', {})) as Record<string, unknown>;
    const pairs = (raw: unknown): Array<readonly [number, number]> =>
      ((raw ?? []) as ReadonlyArray<ReadonlyArray<number>>).map(([k, v]) => [Number(k), Number(v)] as const);

    return {
      totalMembers: Number(value.total_members ?? 0),
      activeMembers: Number(value.active_members ?? 0),
      sessionsHeld: Number(value.sessions_held ?? 0),
      averageAttendance: Number(value.average_attendance ?? 0),
      attendanceRate: Number(value.attendance_rate ?? 0),
      noShows: Number(value.no_shows ?? 0),
      checkInsToday: Number(value.check_ins_today ?? 0),
      attendanceByWeekday: pairs(value.by_weekday),
      attendanceByHour: pairs(value.by_hour),
      attendanceByClassType: ((value.by_class_type ?? []) as ReadonlyArray<ReadonlyArray<string>>).map(
        ([k, v]) => [k as ClassTemplate['classType'], Number(v)] as const
      ),
      mostCoveredTechniques: ((value.most_covered_techniques ?? []) as ReadonlyArray<ReadonlyArray<string | number>>).map(
        ([name, count]) => [String(name), Number(count)] as const
      ),
      leaderboard: ((value.leaderboard ?? []) as ReadonlyArray<Record<string, unknown>>).map((row) => ({
        member: {
          id: String(row.id),
          displayName: String(row.name),
          role: 'member' as const,
          belt: row.belt as Belt,
          stripe: Number(row.stripe) as StripeCount,
          weightBand: '',
          joinedAt: '',
          avatarSeed: String(row.id),
          lastTrainingAt: null,
        },
        sessions30Days: Number(row.sessions30 ?? 0),
        weekStreak: 0,
      })),
      inactiveMembers: ((value.inactive ?? []) as ReadonlyArray<Record<string, unknown>>).map((row) => ({
        member: {
          id: String(row.id),
          displayName: String(row.name),
          role: 'member' as const,
          belt: row.belt as Belt,
          stripe: Number(row.stripe) as StripeCount,
          weightBand: '',
          joinedAt: '',
          avatarSeed: String(row.id),
          lastTrainingAt: row.last_training ? String(row.last_training) : null,
        },
        daysSinceLastTraining: Number(row.days_since ?? 0),
      })),
    };
  },
};

type PollOptionRow = Database['public']['Tables']['poll_options']['Row'];

function toPollOption(row: PollOptionRow): PollOption {
  return {
    id: row.id,
    pollId: row.poll_id,
    label: row.label,
    techniqueId: row.technique_id,
    source: row.source,
    createdById: row.created_by,
    createdAt: row.created_at,
    position: row.position,
  };
}

function toPublicCard(row: MemberPublicRow) {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    belt: row.belt,
    stripe: row.stripe as StripeCount,
    weightBand: row.weight_band ?? 'masa nieznana',
    joinedAt: row.joined_at,
    avatarSeed: row.avatar_seed,
    lastTrainingAt: row.last_training_at,
  };
}
