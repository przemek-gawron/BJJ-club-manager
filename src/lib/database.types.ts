/**
 * Typy Supabase.
 *
 * Generowane: `npm run db:types` (pg-introspect przez SQL z information_schema).
 * Plik jest commitowany, żeby typecheck działał bez podłączonej bazy.
 * Definiujemy tylko to, czego używa klient — reszta jest walidowana po stronie Postgresa.
 */

import type { Belt, ClassType, Level, MemberProfile, PollStatus, Role, SessionStatus, SignupStatus } from '@/domain/types';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          nickname: string | null;
          role: Role;
          membership_status: MemberProfile['membership'];
          joined_at: string;
          weight_kg: number | null;
          phone: string | null;
          belt: Belt;
          stripe: number;
          belt_assigned_at: string;
          avatar_seed: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Omit<Database['public']['Tables']['profiles']['Row'], 'id' | 'email'>> & { id: string; email: string };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      class_templates: {
        Row: {
          id: string;
          name: string;
          class_type: ClassType;
          level: Level;
          weekday: number;
          start_time: string;
          duration_minutes: number;
          capacity: number | null;
          color: string;
          coach_id: string;
          active: boolean;
          description: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['class_templates']['Row']> & { name: string; weekday: number; start_time: string; duration_minutes: number; coach_id: string };
        Update: Partial<Database['public']['Tables']['class_templates']['Row']>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          class_template_id: string;
          coach_id: string;
          starts_at: string;
          ends_at: string;
          status: SessionStatus;
          cancelled_reason: string | null;
          capacity_override: number | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['sessions']['Row']>;
        Update: Partial<Database['public']['Tables']['sessions']['Row']>;
        Relationships: [];
      };
      signups: {
        Row: {
          id: string;
          session_id: string;
          member_id: string;
          status: SignupStatus;
          waitlist_position: number | null;
          created_at: string;
          cancelled_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['signups']['Row']>;
        Update: Partial<Database['public']['Tables']['signups']['Row']>;
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          session_id: string;
          member_id: string;
          checked_in_at: string;
          source: 'qr' | 'coach';
          marked_by: string | null;
          outcome: 'attended';
        };
        Insert: Partial<Database['public']['Tables']['attendance']['Row']>;
        Update: Partial<Database['public']['Tables']['attendance']['Row']>;
        Relationships: [];
      };
      belt_history: {
        Row: {
          id: string;
          member_id: string;
          belt: Belt;
          stripe: number;
          assigned_by: string;
          assigned_at: string;
          note: string | null;
          previous_belt: Belt | null;
          previous_stripe: number | null;
        };
        Insert: Partial<Database['public']['Tables']['belt_history']['Row']>;
        Update: Partial<Database['public']['Tables']['belt_history']['Row']>;
        Relationships: [];
      };
      techniques: {
        Row: { id: string; name: string; category: string; class_type: ClassType | null; usage_count: number; created_at: string };
        Insert: Partial<Database['public']['Tables']['techniques']['Row']>;
        Update: Partial<Database['public']['Tables']['techniques']['Row']>;
        Relationships: [];
      };
      no_shows: {
        Row: { id: string; session_id: string; member_id: string; marked_at: string };
        Insert: Partial<Database['public']['Tables']['no_shows']['Row']>;
        Update: Partial<Database['public']['Tables']['no_shows']['Row']>;
        Relationships: [];
      };
      club_settings: {
        Row: { id: number; name: string; checkin_token: string; city: string | null; timezone: string; updated_at: string };
        Insert: Partial<Database['public']['Tables']['club_settings']['Row']>;
        Update: Partial<Database['public']['Tables']['club_settings']['Row']>;
        Relationships: [];
      };
      polls: {
        Row: {
          id: string;
          session_id: string;
          created_by: string;
          status: PollStatus;
          closes_at: string;
          created_at: string;
          decided_option_id: string | null;
        };
        Insert: Partial<Database['public']['Tables']['polls']['Row']>;
        Update: Partial<Database['public']['Tables']['polls']['Row']>;
        Relationships: [];
      };
      poll_options: {
        Row: {
          id: string;
          poll_id: string;
          label: string;
          technique_id: string | null;
          source: 'coach' | 'member';
          created_by: string;
          position: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['poll_options']['Row']>;
        Update: Partial<Database['public']['Tables']['poll_options']['Row']>;
        Relationships: [];
      };
      poll_votes: {
        Row: { poll_id: string; member_id: string; option_id: string; updated_at: string };
        Insert: Partial<Database['public']['Tables']['poll_votes']['Row']>;
        Update: Partial<Database['public']['Tables']['poll_votes']['Row']>;
        Relationships: [];
      };
      sparring_intents: {
        Row: {
          id: string;
          session_id: string;
          member_id: string;
          intensity: 'light' | 'technical' | 'hard';
          focus: 'any' | 'takedowns' | 'guard' | 'passing' | 'submissions' | 'wrestling';
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['sparring_intents']['Row']>;
        Update: Partial<Database['public']['Tables']['sparring_intents']['Row']>;
        Relationships: [];
      };
    };
    Views: {
      members_public: {
        Row: {
          id: string;
          display_name: string;
          role: Role;
          membership_status: MemberProfile['membership'];
          joined_at: string;
          belt: Belt;
          stripe: number;
          belt_assigned_at: string;
          avatar_seed: string;
          weight_band: string | null;
          weight_band_floor: number | null;
          last_training_at: string | null;
        };
        Relationships: [];
      };
      sessions_with_class: {
        Row: {
          id: string;
          class_template_id: string;
          coach_id: string;
          starts_at: string;
          ends_at: string;
          status: SessionStatus;
          cancelled_reason: string | null;
          capacity_override: number | null;
          class_name: string;
          class_type: ClassType;
          level: Level;
          color: string;
          weekday: number;
          start_time: string;
          duration_minutes: number;
          capacity: number | null;
          coach_name: string;
          signup_count: number;
          waitlist_count: number;
          attendance_count: number;
          is_signed_up: boolean;
          my_waitlist_position: number | null;
          is_checked_in: boolean;
          poll_id: string | null;
          poll_status: PollStatus | null;
          poll_closes_at: string | null;
          poll_votes_count: number;
          my_vote_option_id: string | null;
        };
        Relationships: [];
      };
      session_roster: {
        Row: {
          session_id: string;
          member_id: string;
          status: SignupStatus;
          waitlist_position: number | null;
          signup_at: string;
          checked_in_at: string | null;
          attendance_source: 'qr' | 'coach' | null;
          display_name: string;
          belt: Belt;
          stripe: number;
          weight_kg: number | null;
        };
        Relationships: [];
      };
      session_walk_ins: {
        Row: {
          session_id: string;
          member_id: string;
          checked_in_at: string;
          source: 'qr' | 'coach';
          display_name: string;
          belt: Belt;
          stripe: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      check_in_qr: { Args: { p_token: string; p_session?: string | null }; Returns: unknown };
      join_session: { Args: { p_session: string }; Returns: unknown };
      leave_session: { Args: { p_session: string }; Returns: unknown };
      coach_mark_attendance: { Args: { p_session: string; p_member: string; p_present: boolean }; Returns: unknown };
      close_session: { Args: { p_session: string }; Returns: unknown };
      cancel_session: { Args: { p_session: string; p_reason: string }; Returns: unknown };
      materialize_sessions: { Args: { p_from?: string; p_to?: string }; Returns: unknown };
      publish_poll: { Args: { p_session: string; p_options: ReadonlyArray<string>; p_technique_ids?: ReadonlyArray<string | null> }; Returns: unknown };
      add_poll_suggestion: { Args: { p_poll: string; p_label: string }; Returns: unknown };
      cast_vote: { Args: { p_poll: string; p_option: string }; Returns: unknown };
      decide_poll: { Args: { p_poll: string; p_option: string }; Returns: unknown };
      poll_results: {
        Args: { p_poll: string };
        Returns: ReadonlyArray<{ option_id: string; label: string; source: 'coach' | 'member'; votes: number; total_votes: number; rank: number; is_winner: boolean }>;
      };
      assign_belt: { Args: { p_member: string; p_belt: Belt; p_stripe: number; p_note?: string | null }; Returns: unknown };
      set_membership: { Args: { p_member: string; p_status: MemberProfile['membership'] }; Returns: unknown };
      admin_create_member: {
        Args: {
          p_email: string;
          p_first_name: string;
          p_last_name: string;
          p_role?: Role;
          p_initial_password?: string | null;
          p_belt?: Belt;
          p_weight_kg?: number | null;
        };
        Returns: unknown;
      };
      member_stats: { Args: { p_member: string }; Returns: unknown };
      club_stats: { Args: Record<string, never>; Returns: unknown };
      current_profile: { Args: Record<string, never>; Returns: Record<string, unknown> };
      rotate_checkin_token: { Args: Record<string, never>; Returns: unknown };
    };
    Enums: {
      role_t: Role;
      membership_t: MemberProfile['membership'];
      belt_t: Belt;
      class_type_t: ClassType;
      level_t: Level;
      session_t: SessionStatus;
      signup_t: SignupStatus;
      poll_t: PollStatus;
    };
  };
};
