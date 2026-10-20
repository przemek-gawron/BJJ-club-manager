-- ============================================================================
--  Funkcje biznesowe (RPC)
--
--  Wszystkie reguły (okno check-inu, limity miejsc, głosowanie, paski) mieszkają
--  w bazie jako SECURITY DEFINER. Polityki RLS tylko ograniczają dostęp, więc
--  klient nie może ich obejść. Reguły są lustrzanym odbiciem src/domain/*.ts,
--  który ma z tego testy jednostkowe.
-- ============================================================================

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

-- ============================================================ CHECK-IN =====
-- Okno: 60 min przed startem do 90 min po starcie (musi zgadzać się z
-- src/domain/check-in.ts). Token w QR jest publiczny, dlatego sprawdzamy go
-- względem club_settings, a pozostałe reguły wykonuje ta funkcja.
create or replace function public.check_in_qr(p_token text, p_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile  public.profiles;
  v_settings public.club_settings;
  v_session  public.sessions;
  v_class    text;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    return jsonb_build_object('ok', false, 'kind', 'no_profile',
      'message', 'Nie masz profilu w klubie. Poproś admina o konto.');
  end if;

  if v_profile.membership_status <> 'active' then
    return jsonb_build_object('ok', false, 'kind', 'membership_inactive',
      'message', 'Masz zawieszone członkostwo — zgłoś się do zarządu klubu.');
  end if;

  select * into v_settings from public.club_settings where id = 1;
  if v_settings is null or v_settings.checkin_token <> p_token then
    return jsonb_build_object('ok', false, 'kind', 'bad_token',
      'message', 'Ten kod QR nie należy do naszego klubu.');
  end if;

  -- Sesja wskazana w deep-linku albo najbliższa w oknie check-inu.
  if p_session is not null then
    select * into v_session from public.sessions where id = p_session;
  else
    select * into v_session
    from public.sessions s
    where s.status = 'scheduled'
      and s.starts_at - interval '60 minutes' <= now()
      and s.starts_at + interval '90 minutes' >= now()
    -- Preferujemy zajęcia, które już wystartowały (najbliższa przeszłość).
    order by (s.starts_at <= now()) desc, s.starts_at desc
    limit 1;
  end if;

  if v_session is null then
    return jsonb_build_object('ok', false, 'kind', 'no_session_in_window',
      'message', 'Brak zajęć w tym terminie. Sprawdź grafik — jeśli trenujesz poza planem, poproś trenera.');
  end if;

  if v_session.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'kind', 'cancelled',
      'message', concat('Te zajęcia zostały odwołane', coalesce(' (' || v_session.cancelled_reason || ')', ''), '.'));
  end if;

  select t.name into v_class
  from public.sessions s join public.class_templates t on t.id = s.class_template_id
  where s.id = v_session.id;

  if exists (select 1 from public.attendance a where a.session_id = v_session.id and a.member_id = v_profile.id) then
    return jsonb_build_object('ok', true, 'kind', 'already_checked_in',
      'message', 'Jesteś już na liście: ' || v_class || '. Dobrego treningu!',
      'session_id', v_session.id);
  end if;

  if v_session.starts_at - interval '60 minutes' > now() then
    return jsonb_build_object('ok', false, 'kind', 'too_early',
      'message', 'Za wcześnie — check-in otwiera się godzinę przed startem.');
  end if;

  if v_session.starts_at + interval '90 minutes' < now() then
    return jsonb_build_object('ok', false, 'kind', 'too_late',
      'message', 'Okno check-inu zamknięte. Poproś trenera o dopisanie na listę.');
  end if;

  insert into public.attendance (session_id, member_id, source)
  values (v_session.id, v_profile.id, 'qr');

  -- Skoro jest na macie, nie może figurować jako nieobecny.
  delete from public.no_shows where session_id = v_session.id and member_id = v_profile.id;

  return jsonb_build_object('ok', true, 'kind', 'checked_in',
    'message', 'Jesteś na macie — ' || v_class || '. Miłego treningu!',
    'session_id', v_session.id);
end;
$$;

-- Trener dopisuje osobę (był, ale nie zeskanował) albo ją z listy usuwa.
create or replace function public.coach_mark_attendance(p_session uuid, p_member uuid, p_present boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role not in ('coach', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Dopisywać mogą tylko trenerzy.');
  end if;

  if p_present then
    insert into public.attendance (session_id, member_id, source, marked_by)
    values (p_session, p_member, 'coach', auth.uid())
    on conflict (session_id, member_id) do nothing;
    delete from public.no_shows where session_id = p_session and member_id = p_member;
    return jsonb_build_object('ok', true, 'message', 'Dopisano na listę obecności.');
  end if;

  delete from public.attendance where session_id = p_session and member_id = p_member;
  return jsonb_build_object('ok', true, 'message', 'Usunięto z listy obecności.');
end;
$$;

-- Zamknięcie sesji: zapisany bez check-inu łapie no_show. Idempotentne.
create or replace function public.close_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role not in ('coach', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Zamykać zajęcia mogą tylko trenerzy.');
  end if;

  insert into public.no_shows (session_id, member_id)
  select g.session_id, g.member_id
  from public.signups g
  where g.session_id = p_session
    and g.status = 'active'
    and not exists (select 1 from public.attendance a where a.session_id = p_session and a.member_id = g.member_id)
  on conflict (session_id, member_id) do nothing;

  update public.sessions set status = 'finished' where id = p_session;

  return jsonb_build_object('ok', true, 'message', 'Zajęcia zamknięte.');
end;
$$;

-- ============================================================ ZAPISY =======
create or replace function public.join_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile  public.profiles;
  v_session  public.sessions;
  v_capacity integer;
  v_active   integer;
  v_waitlist integer;
  v_existing public.signups;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.membership_status <> 'active' then
    return jsonb_build_object('ok', false, 'message', 'Aktywuj członkostwo, żeby zapisywać się na zajęcia.');
  end if;

  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null or v_session.status <> 'scheduled' then
    return jsonb_build_object('ok', false, 'message', 'Zajęcia niedostępne.');
  end if;
  if v_session.starts_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'Zajęcia już się rozpoczęły — zapisy zamknięte.');
  end if;

  select * into v_existing from public.signups
  where session_id = p_session and member_id = v_profile.id and status in ('active', 'waitlist');
  if v_existing.id is not null then
    return jsonb_build_object('ok', false, 'kind', v_existing.status,
      'message', 'Jesteś już zapisany na te zajęcia.');
  end if;

  v_capacity := public.session_effective_capacity(p_session);

  -- Advisory lock na sesję: dwa kliknięcia w tej samej chwili nie przekroczą limitu.
  perform pg_advisory_xact_lock(hashtextextended(p_session::text, 0));

  select count(*) into v_active   from public.signups where session_id = p_session and status = 'active';
  select count(*) into v_waitlist from public.signups where session_id = p_session and status = 'waitlist';

  if v_capacity is null or v_active < v_capacity then
    insert into public.signups (session_id, member_id, status)
    values (p_session, v_profile.id, 'active');
    return jsonb_build_object('ok', true, 'kind', 'active',
      'message', case when v_capacity is null then 'Zapisano.' else 'Zapisano — masz miejsce na macie.' end);
  end if;

  insert into public.signups (session_id, member_id, status, waitlist_position)
  values (p_session, v_profile.id, 'waitlist', v_waitlist + 1);
  return jsonb_build_object('ok', true, 'kind', 'waitlist', 'position', v_waitlist + 1,
    'message', 'Wolnych miejsc brak — jesteś w rezerwie na pozycji ' || (v_waitlist + 1) || '.');
end;
$$;

-- Anulacja zapisu + automatyczny awans rezerwy.
create or replace function public.leave_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session  public.sessions;
  v_signup   public.signups;
  v_capacity integer;
  v_active   integer;
  v_free     integer;
  v_promoted integer := 0;
begin
  select * into v_session from public.sessions where id = p_session;
  if v_session.starts_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'Po starcie zajęć nie anulujesz zapisu.');
  end if;

  select * into v_signup from public.signups
  where session_id = p_session and member_id = auth.uid() and status in ('active', 'waitlist');

  if v_signup.id is null then
    return jsonb_build_object('ok', false, 'message', 'Nie masz zapisu na te zajęcia.');
  end if;

  update public.signups
     set status = 'cancelled', cancelled_at = now(), waitlist_position = null
   where id = v_signup.id;

  if v_signup.status = 'waitlist' then
    with ranked as (
      select id, row_number() over (order by waitlist_position nulls last, created_at) as rn
      from public.signups where session_id = p_session and status = 'waitlist'
    )
    update public.signups s set waitlist_position = ranked.rn
    from ranked where s.id = ranked.id;
    return jsonb_build_object('ok', true, 'promoted', 0, 'message', 'Wpis w rezerwie usunięty.');
  end if;

  v_capacity := public.session_effective_capacity(p_session);
  if v_capacity is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_session::text, 0));
    select count(*) into v_active from public.signups where session_id = p_session and status = 'active';
    v_free := v_capacity - v_active;

    if v_free > 0 then
      with promoted as (
        select id from public.signups
        where session_id = p_session and status = 'waitlist'
        order by waitlist_position asc nulls last, created_at asc
        limit v_free
      )
      update public.signups s set status = 'active', waitlist_position = null
      from promoted where s.id = promoted.id;
      get diagnostics v_promoted = row_count;
    end if;
  end if;

  -- Domknij luki w pozycjach rezerwy.
  with ranked as (
    select id, row_number() over (order by created_at) as rn
    from public.signups where session_id = p_session and status = 'waitlist'
  )
  update public.signups s set waitlist_position = ranked.rn
  from ranked where s.id = ranked.id;

  return jsonb_build_object('ok', true, 'promoted', v_promoted,
    'message', case when v_promoted > 0
      then 'Zapis anulowany — miejsce przeszło na osobę z rezerwy.'
      else 'Zapis anulowany.' end);
end;
$$;

-- ============================================================ ANKIETY ======
create or replace function public.publish_poll(
  p_session uuid,
  p_options jsonb,
  p_technique_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      public.profiles;
  v_session    public.sessions;
  v_poll       public.polls;
  v_label      text;
  v_index      integer := 0;
  v_tech_id    uuid;
  v_techniques jsonb := coalesce(p_technique_ids, '[]'::jsonb);
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role not in ('coach', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Ankiety publikują tylko trenerzy.');
  end if;

  select * into v_session from public.sessions where id = p_session;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'message', 'Brak takich zajęć.');
  end if;

  if jsonb_array_length(p_options) < 2 then
    return jsonb_build_object('ok', false, 'message', 'Dodaj co najmniej 2 propozycje.');
  end if;
  if jsonb_array_length(p_options) > 6 then
    return jsonb_build_object('ok', false, 'message', 'Maksymalnie 6 propozycji w jednej ankiecie.');
  end if;

  select * into v_poll from public.polls where session_id = p_session;
  if v_poll.id is not null and v_poll.status = 'closed' then
    return jsonb_build_object('ok', false, 'message', 'Ankieta po tych zajęciach jest zamknięta.');
  end if;

  insert into public.polls (session_id, created_by, status, closes_at)
  values (p_session, auth.uid(), 'open', v_session.starts_at - interval '30 minutes')
  on conflict (session_id) do update
    set status = 'open',
        closes_at = greatest(excluded.created_at, v_session.starts_at - interval '30 minutes'),
        decided_option_id = null
  returning * into v_poll;

  delete from public.poll_options where poll_id = v_poll.id;

  for v_label in select * from jsonb_array_elements_text(p_options)
  loop
    v_tech_id := nullif(v_techniques ->> v_index, '')::uuid;
    insert into public.poll_options (poll_id, label, technique_id, source, created_by, position)
    values (v_poll.id, trim(v_label), v_tech_id, 'coach', auth.uid(), v_index)
    on conflict (poll_id, lower(label)) do nothing;

    if v_tech_id is not null then
      update public.techniques set usage_count = usage_count + 1 where id = v_tech_id;
    end if;
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object('ok', true, 'poll_id', v_poll.id, 'message', 'Ankieta opublikowana.');
end;
$$;

-- Propozycja członka: tylko zapisany, tylko otwarta ankieta, maks. 2 od członków.
create or replace function public.add_poll_suggestion(p_poll uuid, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll    public.polls;
  v_member_count integer;
  v_total   integer;
begin
  select * into v_poll from public.polls where id = p_poll;
  if v_poll.id is null or v_poll.status <> 'open' or v_poll.closes_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'Ankieta jest zamknięta.');
  end if;

  if length(trim(coalesce(p_label, ''))) < 3 then
    return jsonb_build_object('ok', false, 'message', 'Opisz propozycję krótko i konkretnie.');
  end if;

  if not exists (
    select 1 from public.signups
    where session_id = v_poll.session_id and member_id = auth.uid() and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'message', 'Swoją propozycję mogą dodawać tylko zapisani.');
  end if;

  select count(*) into v_member_count from public.poll_options where poll_id = p_poll and source = 'member';
  if v_member_count >= 2 then
    return jsonb_build_object('ok', false, 'message', 'Maksymalnie 2 propozycje od członków w jednej ankiecie.');
  end if;

  select count(*) into v_total from public.poll_options where poll_id = p_poll;

  insert into public.poll_options (poll_id, label, source, created_by, position)
  values (p_poll, trim(p_label), 'member', auth.uid(), v_total);

  return jsonb_build_object('ok', true, 'message', 'Dodano twoją propozycję — zachęć innych do głosu.');
end;
$$;

-- Głos (zmienialny do zamknięcia): jeden wiersz na osobę dzięki PK.
create or replace function public.cast_vote(p_poll uuid, p_option uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll    public.polls;
  v_profile public.profiles;
begin
  select * into v_poll from public.polls where id = p_poll;
  if v_poll.id is null or v_poll.status <> 'open' or v_poll.closes_at <= now() then
    return jsonb_build_object('ok', false, 'message', 'Ankieta jest zamknięta.');
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.membership_status <> 'active' then
    return jsonb_build_object('ok', false, 'message', 'Głosować mogą tylko aktywni członkowie.');
  end if;
  if v_profile.role in ('coach', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Głosują tylko członkowie klubu.');
  end if;

  if not exists (
    select 1 from public.signups
    where session_id = v_poll.session_id and member_id = auth.uid() and status = 'active'
  ) then
    return jsonb_build_object('ok', false, 'message', 'Głosować mogą tylko zapisani na te zajęcia.');
  end if;

  if not exists (select 1 from public.poll_options where id = p_option and poll_id = p_poll) then
    return jsonb_build_object('ok', false, 'message', 'Ta propozycja nie należy do ankiety.');
  end if;

  insert into public.poll_votes (poll_id, member_id, option_id)
  values (p_poll, auth.uid(), p_option)
  on conflict (poll_id, member_id) do update set option_id = excluded.option_id, updated_at = now();

  return jsonb_build_object('ok', true, 'message', 'Głos zapisany.');
end;
$$;

-- Decyzja trenera nadpisuje wynik głosowania (vote jest sugestią).
create or replace function public.decide_poll(p_poll uuid, p_option uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role not in ('coach', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Decyzję podejmuje trener.');
  end if;
  if not exists (select 1 from public.poll_options where id = p_option and poll_id = p_poll) then
    return jsonb_build_object('ok', false, 'message', 'Ta propozycja nie należy do ankiety.');
  end if;

  update public.polls
     set decided_option_id = p_option, status = 'closed'
   where id = p_poll;

  return jsonb_build_object('ok', true, 'message', 'Wynik zatwierdzony.');
end;
$$;

-- Wynik ankiety z deterministycznym tie-breakiem:
-- trener bije propozycję członka, potem starsza propozycja, potem alfabetycznie.
create or replace function public.poll_results(p_poll uuid)
returns table (
  option_id   uuid,
  label       text,
  source      public.option_src_t,
  votes       integer,
  total_votes integer,
  rank        bigint,
  is_winner   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- Głosy liczymy raz w CTE: dawniej podzapytanie zwycięzcy odwoływało się do
  -- vote_count na surowej tabeli poll_options, której ta kolumna nie ma.
  with counted as (
    select
      po.id,
      po.label,
      po.source,
      po.position,
      count(pv.member_id)::integer as vote_count
    from public.poll_options po
    left join public.poll_votes pv on pv.option_id = po.id
    where po.poll_id = p_poll
    group by po.id
  ),
  decided as (
    select p.decided_option_id from public.polls p where p.id = p_poll
  ),
  winner as (
    select c.id
    from counted c
    where c.id = (select decided_option_id from decided)
       or (
         (select decided_option_id from decided) is null
         and c.vote_count > 0
         and c.vote_count = (select max(vote_count) from counted)
       )
    order by (case when c.source = 'coach' then 0 else 1 end), c.position, lower(c.label)
    limit 1
  )
  select
    c.id,
    c.label,
    c.source,
    c.vote_count,
    sum(c.vote_count) over (),
    row_number() over (
      order by c.vote_count desc,
               (case when c.source = 'coach' then 0 else 1 end),
               c.position,
               lower(c.label)
    ) as rank,
    exists (select 1 from winner w where w.id = c.id)
  from counted c
  order by rank;
$$;

-- ========================================================= GRAFIK / STATS ==
-- Materializacja szablonu tygodniowego w sesje. start_time traktujemy jako lokalny
-- czas klubu (Europe/Warsaw), dokładnie tak jak robi to aplikacja.
create or replace function public.materialize_sessions(
  p_from date default (current_date - 42)::date,
  p_to   date default (current_date + 21)::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Grafik synchronizuje tylko trener lub admin.');
  end if;

  insert into public.sessions (class_template_id, coach_id, starts_at, ends_at, status)
  select
    t.id,
    t.coach_id,
    ((d.day + t.start_time)::timestamp at time zone 'Europe/Warsaw')::timestamptz,
    ((d.day + t.start_time)::timestamp at time zone 'Europe/Warsaw')::timestamptz
      + make_interval(mins => t.duration_minutes),
    'scheduled'
  from public.class_templates t
  cross join lateral (
    select generate_series(p_from, p_to, interval '1 day')::date as day
  ) d
  where t.active
    and (extract(isodow from d.day)::int - 1) = t.weekday
  on conflict (class_template_id, starts_at) do nothing;

  get diagnostics v_inserted = row_count;
  return jsonb_build_object('ok', true, 'created', v_inserted, 'message', 'Grafik zsynchronizowany.');
end;
$$;

-- Odwołanie zajęć (miękkie): zapisy i ankieta zostają, frekwencji nie liczymy.
create or replace function public.cancel_session(p_session uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role not in ('coach', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Odwoływać mogą tylko trenerzy.');
  end if;

  update public.sessions
     set status = 'cancelled', cancelled_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_session;

  update public.polls set status = 'closed' where session_id = p_session and status <> 'closed';

  return jsonb_build_object('ok', true, 'message', 'Zajęcia odwołane, członkowie zobaczą powód.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Statystyki liczone po stronie bazy. Tydzień od poniedziałku, dzień kalendarzowy
-- wg Europe/Warsaw — zgodne z src/domain/stats.ts.
-- ---------------------------------------------------------------------------
create or replace function public.member_stats(p_member uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with local as (
    select
      a.session_id,
      (a.checked_in_at at time zone 'Europe/Warsaw')                       as local_ts,
      date_trunc('week', (a.checked_in_at at time zone 'Europe/Warsaw'))   as local_week,
      ((a.checked_in_at at time zone 'Europe/Warsaw')::date)               as local_day
    from public.attendance a
    where a.member_id = p_member
  ),
  weeks as (select distinct local_week from local),
  -- Numer tygodnia = pełne tygodnie od znanego poniedziałku (2020-01-20).
  -- Rachunek na datach, nie na epoch/604800, bo to drugie przesuwa granicę
  -- tygodnia i fałszuje passę.
  week_numbers as (
    select floor((local_week::date - date '2020-01-20') / 7)::bigint as wk from weeks
  ),
  -- Najdłuższa passa tygodniowa w historii: gaps & islands na numerach tygodni.
  islands as (
    select wk, wk - row_number() over (order by wk) as grp from week_numbers
  ),
  longest as (
    select coalesce(max(cnt), 0)::integer as longest_week_streak
    from (select count(*) as cnt from islands group by grp) g
  ),
  -- Regularność miesiąca: % dni (do dziś) z co najmniej jednym treningiem — jak w TS.
  month_progress as (
    select
      (
        select count(distinct local_day)
        from local
        where local_day >= date_trunc('month', (now() at time zone 'Europe/Warsaw'))::date
      ) as trained_days,
      extract(day from (now() at time zone 'Europe/Warsaw'))::int as days_so_far
  ),
  this_week as (
    select floor((date_trunc('week', now() at time zone 'Europe/Warsaw')::date - date '2020-01-20') / 7)::bigint as wk
  ),
  -- Bieżący tydzień bez treningu nie zrywa passy — zaczynamy od poprzedniego.
  anchor as (
    select case
      when exists (select 1 from week_numbers w, this_week t where w.wk = t.wk) then t.wk
      else t.wk - 1
    end as wk
    from this_week t
  ),
  streak as (
    select count(*)::integer as week_streak
    from generate_series(0, 520) as g(idx)
    cross join anchor a
    where exists (select 1 from week_numbers w where w.wk = a.wk - g.idx)
      -- każdy tydzień niżej też musi być obecny — inaczej to już nie passa
      and not exists (
        select 1
        from generate_series(0, g.idx - 1) as g2(i)
        where not exists (select 1 from week_numbers w2 where w2.wk = a.wk - g2.i)
      )
  ),
  by_type as (
    select t.class_type::text as key, count(*)::integer as value
    from local l
    join public.sessions s on s.id = l.session_id
    join public.class_templates t on t.id = s.class_template_id
    group by t.class_type
  ),
  by_weekday as (
    select (extract(isodow from local_day)::int - 1) as key, count(*)::integer as value
    from local
    group by 1
  )
  select jsonb_build_object(
    'member_id', p_member,
    'total_sessions', (select count(*) from local),
    'sessions_this_month', (
      select count(*) from local
      where date_trunc('month', local_ts) = date_trunc('month', now() at time zone 'Europe/Warsaw')
    ),
    'sessions_last_30_days', (
      select count(*) from local
      where local_day >= ((now() at time zone 'Europe/Warsaw')::date - 30)
    ),
    'weekly_average', (
      select round(coalesce(count(*)::numeric / 12, 0), 1)
      from local where local_day >= ((now() at time zone 'Europe/Warsaw')::date - 83)
    ),
    'week_streak', coalesce((select week_streak from streak), 0),
    'longest_week_streak', coalesce((select longest_week_streak from longest), 0),
    'current_month_ratio', (
      select case
        when days_so_far <= 0 then 0
        else least(100, round(trained_days * 100.0 / days_so_far))::int
      end
      from month_progress
    ),
    'no_shows', (select count(*)::integer from public.no_shows n where n.member_id = p_member),
    'by_class_type', (select coalesce(jsonb_agg(jsonb_build_array(key, value) order by value desc), '[]'::jsonb) from by_type),
    'by_weekday',  (select coalesce(jsonb_agg(jsonb_build_array(key, value) order by key), '[]'::jsonb) from by_weekday),
    'last_training_at', (select max(local_ts) at time zone 'Europe/Warsaw' from local),
    'first_training_at', (select min(local_ts) at time zone 'Europe/Warsaw' from local)
  );
$$;

create or replace function public.club_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with att as (
    select a.session_id, a.member_id, (a.checked_in_at at time zone 'Europe/Warsaw') as local_ts
    from public.attendance a
  ),
  held as (
    select s.id from public.sessions s where s.status <> 'scheduled'
  ),
  -- Frekwencja na zakończonych zajęciach: obecni / zapisani (aktywni).
  ratio as (
    select
      (select count(*) from att a where a.session_id in (select id from held))            as present,
      (select count(*) from public.signups g where g.status = 'active'
         and g.session_id in (select id from held))                                       as booked
  )
  select jsonb_build_object(
    'total_members',   (select count(*) from public.profiles),
    'active_members',  (select count(*) from public.profiles where membership_status = 'active'),
    'sessions_held',   (select count(*) from held),
    'average_attendance', (
      select round(coalesce(avg(cnt), 0), 1)
      from (select count(*)::numeric as cnt from att group by session_id) x
    ),
    'attendance_rate', (
      select case when booked = 0 then 0
                  else round(present * 100.0 / booked)::integer end
      from ratio
    ),
    'no_shows',        (select count(*)::integer from public.no_shows),
    'check_ins_today', (
      select count(*)::integer from att
      where local_ts::date = (now() at time zone 'Europe/Warsaw')::date
    ),
    'by_weekday', (
      select coalesce(jsonb_agg(jsonb_build_array(key, value) order by key), '[]'::jsonb)
      from (select (extract(isodow from local_ts)::int - 1) as key, count(*)::integer as value
            from att group by 1) x
    ),
    'by_hour', (
      select coalesce(jsonb_agg(jsonb_build_array(key, value) order by key), '[]'::jsonb)
      from (select extract(hour from local_ts)::int as key, count(*)::integer as value
            from att group by 1) x
    ),
    'by_class_type', (
      select coalesce(jsonb_agg(jsonb_build_array(key, value) order by value desc), '[]'::jsonb)
      from (
        select t.class_type::text as key, count(*)::integer as value
        from att a
        join public.sessions s on s.id = a.session_id
        join public.class_templates t on t.id = s.class_template_id
        group by t.class_type
      ) x
    ),
    'most_covered_techniques', (
      select coalesce(jsonb_agg(jsonb_build_array(name, usage_count) order by usage_count desc), '[]'::jsonb)
      from (select name, usage_count from public.techniques where usage_count > 0
            order by usage_count desc limit 6) x
    ),
    'leaderboard', (
      select coalesce(jsonb_agg(row_json order by sessions30 desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'id', p.id,
                 'name', case when p.nickname is not null and p.nickname <> ''
                              then p.first_name || ' ' || p.nickname
                              else p.first_name end,
                 'belt', p.belt, 'stripe', p.stripe,
                 'sessions30', count(a.id)::integer
               ) as row_json,
               count(a.id)::integer as sessions30
        from public.profiles p
        left join public.attendance a
          on a.member_id = p.id
         and (a.checked_in_at at time zone 'Europe/Warsaw')::date >= ((now() at time zone 'Europe/Warsaw')::date - 30)
        where p.membership_status = 'active'
        group by p.id, p.first_name, p.nickname, p.belt, p.stripe
        order by sessions30 desc, p.first_name
        limit 10
      ) row
    ),
    'inactive', (
      select coalesce(jsonb_agg(row_json order by days_since desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'id', p.id,
                 'name', case when p.nickname is not null and p.nickname <> ''
                              then p.first_name || ' ' || p.nickname
                              else p.first_name end,
                 'belt', p.belt, 'stripe', p.stripe,
                 'last_training', max((a.checked_in_at at time zone 'Europe/Warsaw')::date),
                 'days_since', ((now() at time zone 'Europe/Warsaw')::date - max((a.checked_in_at at time zone 'Europe/Warsaw')::date))::int
               ) as row_json,
               ((now() at time zone 'Europe/Warsaw')::date - max((a.checked_in_at at time zone 'Europe/Warsaw')::date))::int as days_since
        from public.profiles p
        join public.attendance a on a.member_id = p.id
        where p.membership_status = 'active'
        group by p.id, p.first_name, p.nickname, p.belt, p.stripe
        having max((a.checked_in_at at time zone 'Europe/Warsaw')::date) < ((now() at time zone 'Europe/Warsaw')::date - 14)
        order by days_since desc
        limit 12
      ) row
    )
  );
$$;

-- ------------------------------------------------------------- widoki ------
create or replace view public.sessions_with_class as
select
  s.id,
  s.class_template_id,
  s.coach_id,
  s.starts_at,
  s.ends_at,
  s.status,
  s.cancelled_reason,
  s.capacity_override,
  t.name      as class_name,
  t.class_type,
  t.level,
  t.color,
  t.weekday,
  t.start_time,
  t.duration_minutes,
  t.capacity,
  coalesce(trim(c.first_name || ' ' || c.last_name), '—') as coach_name,
  (select count(*) from public.signups g where g.session_id = s.id and g.status = 'active')::integer      as signup_count,
  (select count(*) from public.signups g where g.session_id = s.id and g.status = 'waitlist')::integer     as waitlist_count,
  (select count(*) from public.attendance a where a.session_id = s.id)::integer                            as attendance_count,
  exists (select 1 from public.signups g where g.session_id = s.id and g.member_id = auth.uid() and g.status = 'active') as is_signed_up,
  (select g.waitlist_position from public.signups g
     where g.session_id = s.id and g.member_id = auth.uid() and g.status = 'waitlist')                     as my_waitlist_position,
  exists (select 1 from public.attendance a where a.session_id = s.id and a.member_id = auth.uid())        as is_checked_in,
  p.id        as poll_id,
  p.status    as poll_status,
  p.closes_at as poll_closes_at,
  (select count(*) from public.poll_votes pv where pv.poll_id = p.id)::integer as poll_votes_count,
  (select pv.option_id from public.poll_votes pv where pv.poll_id = p.id and pv.member_id = auth.uid())    as my_vote_option_id
from public.sessions s
join public.class_templates t on t.id = s.class_template_id
left join public.profiles c on c.id = s.coach_id
left join public.polls p on p.session_id = s.id;

grant select on public.sessions_with_class to authenticated;

create or replace view public.session_roster as
select
  g.session_id,
  g.member_id,
  g.status,
  g.waitlist_position,
  g.created_at as signup_at,
  a.checked_in_at,
  a.source     as attendance_source,
  case when p.nickname is not null and p.nickname <> ''
       then trim(p.first_name || ' ' || p.nickname)
       else trim(p.first_name || ' ' || p.last_name) end as display_name,
  p.belt,
  p.stripe,
  p.weight_kg
from public.signups g
join public.profiles p on p.id = g.member_id
left join public.attendance a on a.session_id = g.session_id and a.member_id = g.member_id
where g.status in ('active', 'waitlist');

grant select on public.session_roster to authenticated;

-- Obecni bez zapisu (dopisane przez trenera lub skan bez zapisu) — dopełnia listę.
create or replace view public.session_walk_ins as
select
  a.session_id,
  a.member_id,
  a.checked_in_at,
  a.source,
  case when p.nickname is not null and p.nickname <> ''
       then trim(p.first_name || ' ' || p.nickname)
       else trim(p.first_name || ' ' || p.last_name) end as display_name,
  p.belt,
  p.stripe
from public.attendance a
join public.profiles p on p.id = a.member_id
where not exists (
  select 1 from public.signups g
  where g.session_id = a.session_id and g.member_id = a.member_id and g.status in ('active', 'waitlist')
);

grant select on public.session_walk_ins to authenticated;

-- ========================================================== PASKI / KONTA ==
create or replace function public.assign_belt(
  p_member uuid,
  p_belt public.belt_t,
  p_stripe smallint,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     public.profiles;
  v_member    public.profiles;
  order_map   constant text[] := array['white', 'blue', 'purple', 'brown', 'black'];
  v_from_rank integer;
  v_to_rank   integer;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role not in ('coach', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Paski nadaje tylko trener lub admin.');
  end if;

  select * into v_member from public.profiles where id = p_member;
  if v_member.id is null then
    return jsonb_build_object('ok', false, 'message', 'Brak takiego członka.');
  end if;

  if p_stripe < 0 or p_stripe > 4 then
    return jsonb_build_object('ok', false, 'message', 'Kreska musi być w zakresie 0–4.');
  end if;

  v_from_rank := array_position(order_map, v_member.belt::text) - 1;
  v_to_rank   := array_position(order_map, p_belt::text) - 1;

  if v_to_rank < v_from_rank then
    return jsonb_build_object('ok', false, 'message', 'Nie można obniżyć paska.');
  end if;
  if v_to_rank = v_from_rank and p_stripe <= v_member.stripe then
    return jsonb_build_object('ok', false, 'message', 'W obrębie tego samego pasa kreska może tylko rosnąć.');
  end if;
  if v_to_rank > v_from_rank + 1 then
    return jsonb_build_object('ok', false, 'message', 'Pasek można podnieść tylko o jeden stopień.');
  end if;
  if v_to_rank > v_from_rank and p_stripe <> 0 then
    return jsonb_build_object('ok', false, 'message', 'Nowy pasek zaczyna się od zera kresek.');
  end if;

  insert into public.belt_history (member_id, belt, stripe, assigned_by, note, previous_belt, previous_stripe)
  values (p_member, p_belt, p_stripe, auth.uid(), p_note, v_member.belt, v_member.stripe);

  update public.profiles set belt = p_belt, stripe = p_stripe, belt_assigned_at = now() where id = p_member;

  return jsonb_build_object('ok', true, 'message', 'Zmiana zapisana w historii pasków.');
end;
$$;

-- Admin zakłada konto członka. Bez hasła startowego tworzymy tylko profil —
-- zaproszenie idzie mailem przez Supabase (magic link).
create or replace function public.admin_create_member(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role public.role_t default 'member',
  p_initial_password text default null,
  p_belt public.belt_t default 'white',
  p_weight_kg numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
  v_uid   uuid;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role <> 'admin' then
    return jsonb_build_object('ok', false, 'message', 'Konta tworzy tylko admin.');
  end if;

  if exists (select 1 from public.profiles where lower(email) = lower(trim(p_email))) then
    return jsonb_build_object('ok', false, 'message', 'Takie konto już istnieje.');
  end if;

  v_uid := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email, email_confirmed_at,
    encrypted_password, confirmation_token, recovery_token,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    is_sso_user, is_anonymous
  )
  values (
    v_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', lower(trim(p_email)),
    case when p_initial_password is not null then now() else null end,
    case when p_initial_password is not null then crypt(p_initial_password, gen_salt('bf')) else '' end,
    case when p_initial_password is null then encode(gen_random_bytes(32), 'hex') else null end,
    case when p_initial_password is null then encode(gen_random_bytes(32), 'hex') else null end,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('first_name', p_first_name, 'last_name', p_last_name, 'role', p_role),
    now(), now(), false, false
  );

  update public.profiles
     set role = p_role,
         membership_status = 'active',
         belt = p_belt,
         stripe = 0,
         weight_kg = p_weight_kg
   where id = v_uid;

  insert into public.belt_history (member_id, belt, stripe, assigned_by)
  values (v_uid, p_belt, 0, auth.uid())
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'user_id', v_uid,
    'message', case when p_initial_password is null
      then 'Konto utworzone — ustaw hasło przez link magiczny.'
      else 'Konto utworzone z hasłem startowym.' end);
end;
$$;

create or replace function public.set_membership(p_member uuid, p_status public.membership_t)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles;
begin
  select * into v_actor from public.profiles where id = auth.uid();
  if v_actor.role not in ('coach', 'admin') then
    return jsonb_build_object('ok', false, 'message', 'Członkostwo zmienia trener lub admin.');
  end if;
  update public.profiles set membership_status = p_status where id = p_member;
  return jsonb_build_object('ok', true, 'message', 'Status członkostwa zaktualizowany.');
end;
$$;

create or replace function public.rotate_checkin_token()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Token zmienia tylko admin.');
  end if;
  v_new := 'club-' || substr(encode(gen_random_bytes(9), 'hex'), 1, 12);
  update public.club_settings set checkin_token = v_new, updated_at = now() where id = 1;
  return jsonb_build_object('ok', true, 'token', v_new,
    'message', 'Nowy token zapisany — wydrukuj i powieś nowy kod QR.');
end;
$$;
