/**
 * Kontrakt warstwy danych.
 *
 * Widoki i hooki Query znają tylko ten interfejs. Dwie implementacje:
 *  - `supabase/repository` — produkcyjna (Postgres + RLS + RPC),
 *  - `demo/repository`     — in-memory, z tą samą logiką domenową z src/domain.
 *
 * Dzięki temu UI i reguły da się uruchomić i przetestować bez backendu,
 * a przełączenie to tylko zmienne środowiskowe.
 */

import type {
  AttendanceRecord,
  CheckInResult,
  ClassTemplate,
  ClubStats,
  BeltAssignment,
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
  SparringIntent,
  Technique,
} from '@/domain/types';

export interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}

export interface RosterRow {
  readonly memberId: string;
  readonly displayName: string;
  readonly belt: MemberProfile['belt'];
  readonly stripe: MemberProfile['stripe'];
  readonly weightKg: number | null;
  readonly status: Signup['status'];
  readonly waitlistPosition: number | null;
  readonly checkedInAt: string | null;
  readonly source: AttendanceRecord['source'] | null;
  readonly isWalkIn: boolean;
}

export interface NewMemberInput {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: MemberProfile['role'];
  readonly belt: MemberProfile['belt'];
  readonly weightKg: number | null;
  readonly initialPassword?: string;
}

export interface SparringIntentInput {
  readonly sessionId: string;
  readonly intensity: SparringIntent['intensity'];
  readonly focus: SparringIntent['focus'];
}

export interface ClubApi {
  // ---------------------------------------------------------------- auth --
  readonly mode: 'supabase' | 'demo';
  signIn(email: string, password: string): Promise<ActionResult>;
  signOut(): Promise<void>;
  /** Konta dostępne w trybie demo (ekran logowania pokazuje je jako szybki wybór). */
  demoAccounts?(): ReadonlyArray<{ label: string; email: string; role: string }>;
  signInAsDemo?(email: string): Promise<ActionResult>;
  me(): Promise<MemberProfile | null>;
  updateMe(patch: Partial<Pick<MemberProfile, 'firstName' | 'lastName' | 'nickname' | 'weightKg' | 'phone' | 'notes'>>): Promise<ActionResult>;

  // -------------------------------------------------------------- klub ---
  clubName(): Promise<string>;
  checkInToken(): Promise<string>;
  /** Administracyjna wymiana tokenu w kodzie QR wieszonym przy drzwiach. */
  rotateCheckInToken(): Promise<ActionResult>;

  // ------------------------------------------------------------ grafik ---
  listTemplates(): Promise<ClassTemplate[]>;
  saveTemplate(template: Omit<ClassTemplate, 'id'> & { id?: string }): Promise<ActionResult>;
  setActiveTemplate(id: string, active: boolean): Promise<ActionResult>;
  listSessions(from: Date, to: Date): Promise<Session[]>;
  sessionsWithClass(from: Date, to: Date): Promise<SessionWithClass[]>;
  sessionDetail(id: string): Promise<{ session: SessionWithClass; roster: RosterRow[]; walkIns: RosterRow[] } | null>;
  cancelSession(id: string, reason: string): Promise<ActionResult>;
  closeSession(id: string): Promise<ActionResult>;
  syncSchedule(): Promise<ActionResult>;

  // ----------------------------------------------------------- zapisy ----
  join(sessionId: string): Promise<ActionResult>;
  leave(sessionId: string): Promise<ActionResult>;

  // --------------------------------------------------------- frekwencja --
  checkIn(token: string, sessionId?: string | null): Promise<CheckInResult>;
  markAttendance(sessionId: string, memberId: string, present: boolean): Promise<ActionResult>;
  todaysAttendance(): Promise<ReadonlyArray<AttendanceRecord>>;

  // ------------------------------------------------------------ ankiety --
  techniques(): Promise<Technique[]>;
  pollFor(sessionId: string): Promise<{ poll: Poll; options: PollOption[] } | null>;
  pollSummary(sessionId: string): Promise<PollSummary | null>;
  publishPoll(sessionId: string, labels: ReadonlyArray<string>, techniqueIds: ReadonlyArray<string | null>): Promise<ActionResult>;
  addPollSuggestion(pollId: string, label: string): Promise<ActionResult>;
  vote(pollId: string, optionId: string): Promise<ActionResult>;
  decidePoll(pollId: string, optionId: string): Promise<ActionResult>;

  // ---------------------------------------------------------- członkowie -
  listMembers(): Promise<PublicMemberCard[]>;
  memberCard(id: string): Promise<PublicMemberCard | null>;
  memberDetail(id: string): Promise<{ member: MemberProfile; stats: MemberStats; beltHistory: BeltAssignment[] } | null>;
  assignBelt(memberId: string, belt: MemberProfile['belt'], stripe: 0 | 1 | 2 | 3 | 4, note: string | null): Promise<ActionResult>;
  setMembership(memberId: string, status: MemberProfile['membership']): Promise<ActionResult>;
  createMember(input: NewMemberInput): Promise<ActionResult>;

  // ----------------------------------------------------- tablica sparingów
  sparringBoard(sessionId: string): Promise<SparringCandidate[]>;
  setSparringIntent(input: SparringIntentInput): Promise<ActionResult>;
  clearSparringIntent(sessionId: string): Promise<ActionResult>;

  // --------------------------------------------------------- statystyki --
  memberStats(memberId: string): Promise<MemberStats>;
  clubStats(): Promise<ClubStats>;
}
