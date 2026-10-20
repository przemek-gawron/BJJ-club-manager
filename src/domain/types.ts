/** Model domenowy aplikacji klubu BJJ. Jeden klub (single-tenant) — bez club_id. */

export type Role = 'member' | 'coach' | 'admin';

export type MembershipStatus = 'active' | 'suspended' | 'none';

export type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black';

/** Kreska (stripe) przy danym pasie: 0-4. */
export type StripeCount = 0 | 1 | 2 | 3 | 4;

export type ClassType = 'gi' | 'no_gi' | 'gi_no_gi' | 'open_mat' | 'competition' | 'conditioning';

export type Level = 'all' | 'beginners' | 'intermediate' | 'advanced';

/** Status sesji. `cancelled` miekko odejmuje sesje z obrotu bez kasowania historii. */
export type SessionStatus = 'scheduled' | 'cancelled' | 'finished';

export type SignupStatus = 'active' | 'waitlist' | 'cancelled';

export type AttendanceSource = 'qr' | 'coach';

/** Wynik obecności po zakończeniu sesji. */
export type AttendanceOutcome = 'attended' | 'no_show';

export type PollStatus = 'draft' | 'open' | 'closed';

/** Źródło propozycji w ankiecie — potrzebne do tie-breaku i do statystyk. */
export type PollOptionSource = 'coach' | 'member';

export type SparringIntensity = 'light' | 'technical' | 'hard';

export type SparringFocus = 'any' | 'takedowns' | 'guard' | 'passing' | 'submissions' | 'wrestling';

export interface BeltAssignment {
  readonly id: string;
  readonly memberId: string;
  readonly belt: Belt;
  readonly stripe: StripeCount;
  readonly assignedById: string;
  readonly assignedAt: string;
  readonly note: string | null;
}

export interface MemberProfile {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly nickname: string | null;
  readonly role: Role;
  readonly membership: MembershipStatus;
  readonly joinedAt: string;
  readonly weightKg: number | null;
  readonly phone: string | null;
  readonly belt: Belt;
  readonly stripe: StripeCount;
  readonly beltAssignedAt: string;
  readonly avatarSeed: string;
  readonly notes: string | null;
}

/** Widok profilu widoczny dla innego członka klubu — bez e-maila, telefonu i dokladnej masy. */
export interface PublicMemberCard {
  readonly id: string;
  readonly displayName: string;
  readonly role: Role;
  readonly belt: Belt;
  readonly stripe: StripeCount;
  readonly weightBand: string;
  readonly joinedAt: string;
  readonly avatarSeed: string;
  readonly lastTrainingAt: string | null;
}

export interface ClassTemplate {
  readonly id: string;
  readonly name: string;
  readonly classType: ClassType;
  readonly level: Level;
  readonly weekday: number; // 0 = poniedzialek ... 6 = niedziela
  readonly startTime: string; // "HH:mm" czasu Europe/Warsaw
  readonly durationMinutes: number;
  readonly capacity: number | null;
  readonly color: string;
  readonly coachId: string;
  readonly active: boolean;
  readonly description: string | null;
}

export interface Session {
  readonly id: string;
  readonly classTemplateId: string;
  readonly coachId: string;
  readonly startsAt: string; // ISO UTC
  readonly endsAt: string; // ISO UTC
  readonly status: SessionStatus;
  readonly cancelledReason: string | null;
  readonly capacityOverride: number | null;
}

export interface Signup {
  readonly id: string;
  readonly sessionId: string;
  readonly memberId: string;
  readonly status: SignupStatus;
  readonly waitlistPosition: number | null;
  readonly createdAt: string;
  readonly cancelledAt: string | null;
}

export interface AttendanceRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly memberId: string;
  readonly checkedInAt: string; // ISO UTC
  readonly source: AttendanceSource;
  readonly markedById: string | null;
  readonly outcome: AttendanceOutcome;
}

export interface Technique {
  readonly id: string;
  readonly name: string;
  readonly category: SparringFocus | 'escapes' | 'position';
  readonly classType: ClassType | 'any';
  readonly usageCount: number;
  /** Krótki opis po polsku pokazywany trenerowi przy wyborze propozycji. */
  readonly description?: string | null;
}

export interface Poll {
  readonly id: string;
  readonly sessionId: string;
  readonly createdBy: string;
  readonly status: PollStatus;
  readonly closesAt: string; // ISO UTC
  readonly createdAt: string;
  readonly decidedOptionId: string | null;
}

export interface PollOption {
  readonly id: string;
  readonly pollId: string;
  readonly label: string;
  readonly techniqueId: string | null;
  readonly source: PollOptionSource;
  readonly createdById: string;
  readonly createdAt: string;
  readonly position: number;
}

export interface PollVote {
  readonly pollId: string;
  readonly memberId: string;
  readonly optionId: string;
  readonly updatedAt: string;
}

export interface SparringIntent {
  readonly id: string;
  readonly sessionId: string;
  readonly memberId: string;
  readonly intensity: SparringIntensity;
  readonly focus: SparringFocus;
  readonly createdAt: string;
}

/** Połączenie sesji z szablonem — wygodny widok dla UI. */
/** Sesja z dołączonym szablonem i stanem dla zalogowanej osoby. */
export interface SessionWithClass extends Session {
  readonly classTemplate: ClassTemplate;
  readonly coachName: string;
  readonly signupCount: number;
  readonly waitlistCount: number;
  readonly attendanceCount: number;
  readonly isSignedUp: boolean;
  readonly isWaitlisted: boolean;
  readonly myWaitlistPosition: number | null;
  readonly isCheckedIn: boolean;
  readonly pollId: string | null;
  readonly pollStatus: PollStatus | null;
  readonly pollClosesAt: string | null;
  readonly pollVotesCount: number;
  readonly myVoteOptionId: string | null;
}

export interface PollOptionTally {
  readonly option: PollOption;
  readonly votes: number;
  readonly isWinner: boolean;
  readonly myVote: boolean;
}

export interface PollSummary {
  readonly poll: Poll;
  readonly sessionId: string;
  readonly options: ReadonlyArray<PollOptionTally>;
  readonly totalVotes: number;
  readonly winnerOptionId: string | null;
  readonly canVote: boolean;
  /** Członek może dorzucić swoją propozycję (limit i status sprawdzone w logice). */
  readonly canSuggest: boolean;
  readonly isCoachView: boolean;
  readonly closesAt: string;
  readonly status: PollStatus;
}

export interface MemberStats {
  readonly memberId: string;
  readonly totalSessions: number;
  readonly sessionsThisMonth: number;
  readonly sessionsLast30Days: number;
  readonly weeklyAverage: number;
  readonly weekStreak: number;
  readonly longestWeekStreak: number;
  readonly currentMonthRatio: number;
  readonly noShows: number;
  readonly byClassType: ReadonlyArray<readonly [ClassType, number]>;
  readonly byWeekday: ReadonlyArray<readonly [number, number]>;
  readonly history: ReadonlyArray<AttendanceRecord>;
  readonly lastTrainingAt: string | null;
  readonly firstTrainingAt: string | null;
}

export interface ClubStats {
  readonly totalMembers: number;
  readonly activeMembers: number;
  readonly sessionsHeld: number;
  readonly averageAttendance: number;
  readonly attendanceRate: number;
  readonly noShows: number;
  readonly checkInsToday: number;
  readonly attendanceByWeekday: ReadonlyArray<readonly [number, number]>;
  readonly attendanceByHour: ReadonlyArray<readonly [number, number]>;
  readonly attendanceByClassType: ReadonlyArray<readonly [ClassType, number]>;
  readonly mostCoveredTechniques: ReadonlyArray<readonly [string, number]>;
  readonly leaderboard: ReadonlyArray<LeaderboardRow>;
  readonly inactiveMembers: ReadonlyArray<InactiveMember>;
}

export interface LeaderboardRow {
  readonly member: PublicMemberCard;
  readonly sessions30Days: number;
  readonly weekStreak: number;
}

export interface InactiveMember {
  readonly member: PublicMemberCard;
  readonly daysSinceLastTraining: number;
}

export interface SparringCandidate {
  readonly member: PublicMemberCard;
  readonly intent: SparringIntent;
  readonly beltGap: number;
  readonly weightDeltaKg: number | null;
  readonly compatibility: number;
  readonly reasons: ReadonlyArray<string>;
}

export interface CheckInResult {
  readonly kind:
    | 'checked_in'
    | 'already_checked_in'
    | 'no_session_in_window'
    | 'not_member'
    | 'membership_inactive'
    | 'too_early'
    | 'too_late'
    | 'bad_token';
  readonly ok: boolean;
  readonly message: string;
  readonly session: SessionWithClass | null;
}
