-- ============================================================================
--  Autoryzacja (RLS) + pomocnicze role
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.belt_history      enable row level security;
alter table public.class_templates   enable row level security;
alter table public.sessions          enable row level security;
alter table public.signups           enable row level security;
alter table public.attendance        enable row level security;
alter table public.no_shows          enable row level security;
alter table public.techniques        enable row level security;
alter table public.polls             enable row level security;
alter table public.poll_options      enable row level security;
alter table public.poll_votes        enable row level security;
alter table public.sparring_intents  enable row level security;
alter table public.club_settings     enable row level security;

-- Pomocnicze funkcje. SECURITY DEFINER, żeby polityki na profiles nie rekurencjowały
-- same siebie (polityka na profiles nie może odpytywać profiles).
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('coach', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.membership_status = 'active'
  );
$$;

-- ---------------------------------------------------------------- profiles --
-- Tabela profiles trzyma dane wrażliwe (e-mail, telefon, notatki trenera, dokładna
-- masa). Polityka „using (true)” nie mogła ich ukryć: RLS filtruje wiersze, a nie
-- kolumny, więc każdy członek klubu wyczytał przez REST kontakty i notatki wszystkich
-- pozostałych. Katalog członków idzie przez widok members_public (bez kontaktu i bez
-- dokładnej masy), pełny profil widzi tylko właściciel konta i kadra.
create policy profiles_select_self_or_staff on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- roli, członkostwa i paska nie można sobie ustawić samodzielnie
    and role = public.profiles.role
    and membership_status = public.profiles.membership_status
    and belt = public.profiles.belt
    and stripe = public.profiles.stripe
  );

create policy profiles_write_staff on public.profiles
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Prywatność: e-mail i telefon widoczne tylko dla właściciela konta i trenera/admina.
create or replace view public.members_public as
select
  p.id,
  case
    when p.nickname is not null and p.nickname <> ''
      then p.first_name || ' „' || p.nickname || '”'
    else p.first_name || ' ' || p.last_name
  end as display_name,
  -- Imię/nazwisko/ksywa są tu celowo: to dane, które i tak pokazuje display_name,
  -- a ekran profilu potrzebuje ich osobno. Kontakt (e-mail, telefon, notatki) zostaje
  -- w tabeli profiles — poza zasięgiem nietrenerów.
  p.first_name,
  p.last_name,
  p.nickname,
  p.role,
  p.membership_status,
  p.joined_at,
  p.belt,
  p.stripe,
  p.belt_assigned_at,
  p.avatar_seed,
  -- masa pokazana jako przedział 10 kg — wystarcza do matchowania, nie ujawnia dokładnej wagi
  case
    when p.weight_kg is null then null
    else concat(floor(p.weight_kg / 10) * 10, '–', floor(p.weight_kg / 10) * 10 + 9, ' kg')
  end as weight_band,
  floor(p.weight_kg / 10) * 10 as weight_band_floor,
  (select max(a.checked_in_at) from public.attendance a where a.member_id = p.id) as last_training_at
from public.profiles p;

grant select on public.members_public to authenticated;

-- Pełny profil (masa, kontakt, notatki) czytamy z tabeli profiles, nie z widoku.
-- Wcześniej istniał tu widok members_staff z „RLS na widoku” — Postgres nie pozwala
-- ani włączyć RLS na widoku, ani założyć na nim polityki, więc migracja wywalała się
-- dokładnie w tym miejscu. Gdyby tylko usunąć `alter view`, zostałby widok bez żadnej
-- ochrony, a Supabase domyślnie nadaje widokom SELECT roli authenticated — czyli każdy
-- członek klubu wyczytałby przez REST e-maile, telefony i notatki wszystkich pozostałych.
-- Widok nie miał odbiorców w kodzie aplikacji, więc go usuwamy.
drop view if exists public.members_staff;

-- ----------------------------------------------------------- belt_history --
create policy belt_history_select on public.belt_history
  for select to authenticated using (true);

create policy belt_history_write_staff on public.belt_history
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ------------------------------------------------------- class_templates ---
create policy templates_select on public.class_templates
  for select to authenticated using (true);

create policy templates_write_staff on public.class_templates
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- -------------------------------------------------------------- sessions ---
create policy sessions_select on public.sessions
  for select to authenticated using (true);

create policy sessions_write_staff on public.sessions
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- --------------------------------------------------------------- signups ---
create policy signups_select on public.signups
  for select to authenticated using (true);

-- Własne zapisy — tylko członek z aktywnym członkostwem, na zajęcia w przyszłości,
-- przy nieodwołanej sesji. Trener obsługuje frekwencję osobnym RPC.
create policy signups_insert_self on public.signups
  for insert to authenticated
  with check (
    member_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.sessions s
      where s.id = signups.session_id
        and s.status = 'scheduled'
        and s.starts_at > now()
    )
  );

create policy signups_update_self on public.signups
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy signups_write_staff on public.signups
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ----------------------------------------------------------- attendance ----
create policy attendance_select on public.attendance
  for select to authenticated using (true);

-- Wstawianie frekwencji wyłącznie przez RPC (check_in_qr / coach_mark_attendance),
-- które pilnuje okna czasowego, tokena klubu i jednorazowości. Bez direct insertu.
create policy attendance_write_staff on public.attendance
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy no_shows_select on public.no_shows
  for select to authenticated using (true);

create policy no_shows_write_staff on public.no_shows
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ------------------------------------------------------------ ankiety ------
create policy techniques_select on public.techniques
  for select to authenticated using (true);

create policy techniques_write_staff on public.techniques
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy polls_select on public.polls
  for select to authenticated using (true);

create policy polls_write_staff on public.polls
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy poll_options_select on public.poll_options
  for select to authenticated using (true);

-- Propozycje trenerów — przez politykę staff; propozycje członków idą przez RPC.
create policy poll_options_write_staff on public.poll_options
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Głosy: członek widzi swoje i cudze (liczniki są publiczne w ankiecie), ale
-- wstawia/aktualizuje wyłącznie własny i tylko gdy ankieta jest otwarta.
create policy poll_votes_select on public.poll_votes
  for select to authenticated using (true);

create policy poll_votes_insert_self on public.poll_votes
  for insert to authenticated
  with check (
    member_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.polls pl
      where pl.id = poll_votes.poll_id
        and pl.status = 'open'
        and pl.closes_at > now()
    )
    and exists (
      select 1 from public.signups sg
      where sg.session_id = (select session_id from public.polls where id = poll_votes.poll_id)
        and sg.member_id = poll_votes.member_id
        and sg.status = 'active'
    )
    and exists (
      select 1 from public.poll_options po
      where po.id = poll_votes.option_id and po.poll_id = poll_votes.poll_id
    )
  );

create policy poll_votes_update_self on public.poll_votes
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy poll_votes_delete_self on public.poll_votes
  for delete to authenticated using (member_id = auth.uid());

-- ------------------------------------------------- tablica sparingów -------
create policy sparring_select on public.sparring_intents
  for select to authenticated using (true);

create policy sparring_insert_self on public.sparring_intents
  for insert to authenticated
  with check (
    member_id = auth.uid()
    and public.is_active_member()
    and exists (
      select 1 from public.sessions s
      where s.id = sparring_intents.session_id
        and s.status = 'scheduled'
        and s.ends_at > now()
    )
  );

create policy sparring_update_self on public.sparring_intents
  for update to authenticated
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy sparring_delete_self on public.sparring_intents
  for delete to authenticated using (member_id = auth.uid());

-- Trener sprząta tablicę po sesji.
create policy sparring_write_staff on public.sparring_intents
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ------------------------------------------------------------ club -------
-- club_settings trzyma token z kodu QR. Polityka „using (true)” na całej tabeli
-- udostępniałaby go każdemu zalogowanemu — a to on jest jedynym „hasłem” przy drzwiach:
-- zna go każdy, kto ma aplikację, ten może się zameldować. Dlatego nazwa/city/timezone
-- idą do widoku club_public, a tabela zostaje dla kadry.
create or replace view public.club_public as
select id, name, city, timezone, updated_at from public.club_settings;

grant select on public.club_public to authenticated;

create policy club_settings_select_staff on public.club_settings
  for select to authenticated using (public.is_staff());

create policy club_settings_write_admin on public.club_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
