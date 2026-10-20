-- ============================================================================
--  BJJ Club Manager — schemat bazowy (single-tenant: jeden klub, bez club_id)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----
create type public.role_t         as enum ('member', 'coach', 'admin');
create type public.membership_t   as enum ('active', 'suspended', 'none');
create type public.belt_t         as enum ('white', 'blue', 'purple', 'brown', 'black');
create type public.class_type_t   as enum ('gi', 'no_gi', 'gi_no_gi', 'open_mat', 'competition', 'conditioning');
create type public.level_t        as enum ('all', 'beginners', 'intermediate', 'advanced');
create type public.session_t      as enum ('scheduled', 'cancelled', 'finished');
create type public.signup_t       as enum ('active', 'waitlist', 'cancelled');
create type public.source_t       as enum ('qr', 'coach');
create type public.outcome_t      as enum ('attended', 'no_show');
create type public.poll_t         as enum ('draft', 'open', 'closed');
create type public.option_src_t   as enum ('coach', 'member');
create type public.intensity_t    as enum ('light', 'technical', 'hard');
create type public.focus_t        as enum ('any', 'takedowns', 'guard', 'passing', 'submissions', 'wrestling');

-- ------------------------------------------------------------ profile ------
-- profil.membership_status to jedyny źródłowy stan członkostwa; role decyduje
-- o uprawnieniach, członkostwo o prawie do treningu (uzgodnione: bez płatności
-- w aplikacji, admin przełącza ręcznie).
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  first_name        text not null,
  last_name         text not null,
  nickname          text,
  role              public.role_t not null default 'member',
  membership_status public.membership_t not null default 'active',
  joined_at         timestamptz not null default now(),
  weight_kg         numeric(4, 1) check (weight_kg is null or (weight_kg >= 25 and weight_kg <= 250)),
  phone             text,
  belt              public.belt_t not null default 'white',
  stripe            smallint not null default 0 check (stripe between 0 and 4),
  belt_assigned_at  timestamptz not null default now(),
  avatar_seed       text not null default md5(random()::text),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_membership_idx on public.profiles (membership_status);

-- Historia pasków: kto nadał, kiedy, z jaką notatką. Profil trzyma aktualny stan,
-- tabela historia — pełny audyt (potrzebne do statystyk i do matchowania).
create table public.belt_history (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles (id) on delete cascade,
  belt           public.belt_t not null,
  stripe         smallint not null check (stripe between 0 and 4),
  assigned_by    uuid not null references public.profiles (id) on delete restrict,
  assigned_at    timestamptz not null default now(),
  note           text,
  previous_belt  public.belt_t,
  previous_stripe smallint
);

create index belt_history_member_idx on public.belt_history (member_id, assigned_at desc);

-- ------------------------------------------------------------- grafik ------
-- Szablon tygodniowy. Sesje materializują się z niego w tabeli sessions,
-- dzięki temu pojedyncze odwołanie nie rusza reszty cyklu.
create table public.class_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  class_type       public.class_type_t not null default 'gi',
  level            public.level_t not null default 'all',
  weekday          smallint not null check (weekday between 0 and 6), -- 0 = poniedziałek
  start_time       time not null,                                      -- lokalnie Europe/Warsaw
  duration_minutes integer not null check (duration_minutes between 15 and 240),
  capacity         integer check (capacity is null or capacity > 0),   -- null = bez limitu
  color            text not null default '#2F6FED',
  coach_id         uuid not null references public.profiles (id) on delete restrict,
  active           boolean not null default true,
  description      text,
  created_at       timestamptz not null default now()
);

create index class_templates_weekday_idx on public.class_templates (weekday, start_time);

-- Materialna sesja — jednostka, do której zapisujemy, głosujemy i liczymy frekwencję.
create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  class_template_id uuid not null references public.class_templates (id) on delete cascade,
  coach_id          uuid not null references public.profiles (id) on delete restrict,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            public.session_t not null default 'scheduled',
  cancelled_reason  text,
  capacity_override integer check (capacity_override is null or capacity_override > 0),
  created_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- Jedna sesja na szablon i godzinę — chroni przed duplikatami przy powtórnej materializacji.
create unique index sessions_template_start_key on public.sessions (class_template_id, starts_at);
create index sessions_starts_at_idx on public.sessions (starts_at desc);
create index sessions_status_idx on public.sessions (status);

create or replace function public.session_effective_capacity(p_session uuid)
returns integer
language sql
stable
as $$
  select coalesce(
    s.capacity_override,
    t.capacity,
    null
  )
  from public.sessions s
  join public.class_templates t on t.id = s.class_template_id
  where s.id = p_session;
$$;

-- ----------------------------------------------------------- zapisy --------
create table public.signups (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions (id) on delete cascade,
  member_id        uuid not null references public.profiles (id) on delete cascade,
  status           public.signup_t not null default 'active',
  waitlist_position integer,
  created_at       timestamptz not null default now(),
  cancelled_at     timestamptz,
  check (status <> 'waitlist' or waitlist_position is not null)
);

-- Jeden aktywny zapis / rezerwa na osobę; anulowane zapisy zostają w historii.
create unique index signups_active_one_per_member on public.signups (session_id, member_id) where status in ('active', 'waitlist');
create index signups_session_idx on public.signups (session_id, status);
create index signups_member_idx on public.signups (member_id, status);

-- --------------------------------------------------------- frekwencja ------
-- Tylko ten zapis liczy się do statystyk. Źródło rozróżnia skan QR od dopisania
-- przez trenera, żeby dało się ocenić, ile osób zapomina skanować.
create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions (id) on delete cascade,
  member_id    uuid not null references public.profiles (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  source       public.source_t not null default 'qr',
  marked_by    uuid references public.profiles (id) on delete set null,
  outcome      public.outcome_t not null default 'attended',
  check (outcome = 'attended')
);

create unique index attendance_one_check_in_per_session on public.attendance (session_id, member_id);
create index attendance_member_idx on public.attendance (member_id, checked_in_at desc);
create index attendance_session_idx on public.attendance (session_id);

-- Nieobecność zapisanego, który nie przyszedł. Osobna tabela, żeby nie mieszać
-- jej z faktyczną obecnością (frekwencja = tylko attendance).
create table public.no_shows (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  member_id  uuid not null references public.profiles (id) on delete cascade,
  marked_at  timestamptz not null default now(),
  unique (session_id, member_id)
);

create index no_shows_member_idx on public.no_shows (member_id, marked_at desc);

-- ------------------------------------------------------------- ankiety -----
create table public.techniques (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    public.focus_t not null default 'any',
  class_type  public.class_type_t,
  usage_count integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (name)
);

create index techniques_usage_idx on public.techniques (usage_count desc);

create table public.polls (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.sessions (id) on delete cascade,
  created_by        uuid not null references public.profiles (id) on delete cascade,
  status            public.poll_t not null default 'draft',
  closes_at         timestamptz not null,
  created_at        timestamptz not null default now(),
  decided_option_id uuid,
  check (closes_at > created_at)
);

-- Jedna ankieta na sesję — wygrywa majority vote, decyzja trenera może nadpisać.
create unique index polls_one_per_session on public.polls (session_id);

create table public.poll_options (
  id           uuid primary key default gen_random_uuid(),
  poll_id      uuid not null references public.polls (id) on delete cascade,
  label        text not null,
  technique_id uuid references public.techniques (id) on delete set null,
  source       public.option_src_t not null default 'coach',
  created_by   uuid not null references public.profiles (id) on delete cascade,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (poll_id, lower(label))
);

create index poll_options_poll_idx on public.poll_options (poll_id, position);

create table public.poll_votes (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  member_id  uuid not null references public.profiles (id) on delete cascade,
  option_id  uuid not null references public.poll_options (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (poll_id, member_id)
);

create index poll_votes_option_idx on public.poll_votes (poll_id, option_id);

-- ------------------------------------------------------ tablica sparingów --
create table public.sparring_intents (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  member_id  uuid not null references public.profiles (id) on delete cascade,
  intensity  public.intensity_t not null default 'technical',
  focus      public.focus_t not null default 'any',
  created_at timestamptz not null default now(),
  unique (session_id, member_id)
);

create index sparring_intents_session_idx on public.sparring_intents (session_id);

-- --------------------------------------------------------------- club ------
-- Ustawienia klubu: publiczny token QR, nazwa, strefa. Single-tenant, więc jeden wiersz.
create table public.club_settings (
  id              integer primary key default 1 check (id = 1),
  name            text not null default 'BJJ Club',
  checkin_token   text not null unique,
  city            text,
  timezone        text not null default 'Europe/Warsaw',
  updated_at      timestamptz not null default now()
);

insert into public.club_settings (id, name, checkin_token, city)
values (1, 'BJJ Club', 'club-demo-2026', 'Warszawa')
on conflict (id) do nothing;

-- ------------------------------------------------------------- trigger -----
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

-- Profil zakładany razem z kontem w auth.users. Bez tego widoki z joinem
-- na profiles zwracałyby puste wyniki dla nowych członków.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, role, membership_status)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), 'Nowy'),
    coalesce(nullif(new.raw_user_meta_data ->> 'last_name', ''), 'Członek'),
    coalesce((new.raw_user_meta_data ->> 'role')::public.role_t, 'member'),
    coalesce((new.raw_user_meta_data ->> 'membership_status')::public.membership_t, 'none')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
