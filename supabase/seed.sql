-- ============================================================================
--  Dane demonstracyjne: 15 członków z różnymi paskami i masą, 6 klas,
--  4 tygodnie historii frekwencji, 2 ankiety, techniki.
--
--  Uruchom w Supabase: SQL Editor -> wklej -> Run. Albo: npm run db:seed
--  ID kont są stałe (uuid5 z nazwy), więc seed jest idempotentny.
-- ============================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------- konta -----
-- Hasło startowe wszystkich kont demo: Trening123!
-- (crypt z bcrypt — zmienić przed użyciem na produkcji).
with people(slug, first_name, last_name, nickname, role_name, membership, belt, stripe, weight, joined, phone) as (
  values
    ('tomasz',   'Tomasz',   'Wrona',     null,        'admin',   'active',    'black',  2, 88.0, '2015-02-02', '+48 600 100 100'),
    ('magda',    'Magda',    'Zielińska', null,        'coach',   'active',    'brown',  3, 63.0, '2017-09-04', '+48 600 100 101'),
    ('kuba',     'Kuba',     'Lewandowski', 'Rakieta', 'member',  'active',    'blue',   2, 82.0, '2021-03-01', null),
    ('ola',      'Ola',      'Nowak',     'Woda',      'member',  'active',    'blue',   0, 61.0, '2021-10-11', null),
    ('piotr',    'Piotr',    'Mazur',     'Góra',      'member',  'active',    'purple', 1, 97.0, '2018-01-15', null),
    ('anna',     'Anna',     'Kowalska',  null,        'member',  'active',    'white',  3, 58.0, '2024-02-19', null),
    ('marek',    'Marek',    'Lis',       'Buldożer',  'member',  'active',    'blue',   4, 91.0, '2020-06-08', null),
    ('ewa',      'Ewa',      'Dąbrowska', null,        'member',  'active',    'white',  1, 66.0, '2025-01-06', null),
    ('jakub',    'Jakub',    'Woźniak',   'Kajak',     'member',  'active',    'green',  0, 74.0, '2019-11-25', null),
    ('karolina', 'Karolina', 'Kaczmarek', null,        'member',  'active',    'blue',   1, 59.0, '2022-04-04', null),
    ('grzegorz', 'Grzegorz', 'Zakrzewski', 'Grześ',    'member',  'active',    'purple', 4, 85.0, '2016-08-22', null),
    ('natalia',  'Natalia',  'Sikora',    null,        'member',  'active',    'white',  0, 68.0, '2025-09-08', null),
    ('adam',     'Adam',     'Król',      'Król Maty', 'member',  'active',    'brown',  0, 79.0, '2014-05-12', null),
    ('iwona',    'Iwona',    'Michalska', null,        'member',  'suspended', 'blue',   2, 64.0, '2020-10-19', null),
    ('bartek',   'Bartek',   'Urbański',  'Barcik',    'member',  'active',    'white',  2, 103.0, '2025-06-02', null)
),
new_users as (
  insert into auth.users (
    id, instance_id, aud, role, email, email_confirmed_at, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
  )
  select
    uuid_generate_v5(uuid_ns_dns(), p.slug || '.bjj-club-demo'),
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    p.slug || '@bjjclub.demo',
    now(), crypt('Trening123!', gen_salt('bf')),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name, 'role', p.role_name),
    now(), now(), false, false
  from people p
  on conflict (id) do nothing
  returning id
)
select count(*) as utworzono_kont from new_users;

-- Trigger handle_new_auth_user tworzy profile; tu nadpisujemy dane demo.
update public.profiles p
   set first_name = x.first_name,
       last_name  = x.last_name,
       nickname   = x.nickname,
       role       = x.role_name::public.role_t,
       membership_status = x.membership::public.membership_t,
       belt       = x.belt::public.belt_t,
       stripe     = x.stripe,
       weight_kg  = x.weight,
       joined_at  = x.joined::timestamptz,
       phone      = x.phone,
       avatar_seed = x.slug
from (
  values
    ('tomasz',   'Tomasz',   'Wrona',     null,        'admin',   'active',    'black',  2, 88.0, '2015-02-02', '+48 600 100 100'),
    ('magda',    'Magda',    'Zielińska', null,        'coach',   'active',    'brown',  3, 63.0, '2017-09-04', '+48 600 100 101'),
    ('kuba',     'Kuba',     'Lewandowski', 'Rakieta', 'member',  'active',    'blue',   2, 82.0, '2021-03-01', null),
    ('ola',      'Ola',      'Nowak',     'Woda',      'member',  'active',    'blue',   0, 61.0, '2021-10-11', null),
    ('piotr',    'Piotr',    'Mazur',     'Góra',      'member',  'active',    'purple', 1, 97.0, '2018-01-15', null),
    ('anna',     'Anna',     'Kowalska',  null,        'member',  'active',    'white',  3, 58.0, '2024-02-19', null),
    ('marek',    'Marek',    'Lis',       'Buldożer',  'member',  'active',    'blue',   4, 91.0, '2020-06-08', null),
    ('ewa',      'Ewa',      'Dąbrowska', null,        'member',  'active',    'white',  1, 66.0, '2025-01-06', null),
    ('jakub',    'Jakub',    'Woźniak',   'Kajak',     'member',  'active',    'blue',   0, 74.0, '2019-11-25', null),
    ('karolina', 'Karolina', 'Kaczmarek', null,        'member',  'active',    'blue',   1, 59.0, '2022-04-04', null),
    ('grzegorz', 'Grzegorz', 'Zakrzewski', 'Grześ',    'member',  'active',    'purple', 4, 85.0, '2016-08-22', null),
    ('natalia',  'Natalia',  'Sikora',    null,        'member',  'active',    'white',  0, 68.0, '2025-09-08', null),
    ('adam',     'Adam',     'Król',      'Król Maty', 'member',  'active',    'brown',  0, 79.0, '2014-05-12', null),
    ('iwona',    'Iwona',    'Michalska', null,        'member',  'suspended', 'blue',   2, 64.0, '2020-10-19', null),
    ('bartek',   'Bartek',   'Urbański',  'Barcik',    'member',  'active',    'white',  2, 103.0, '2025-06-02', null)
) as x(slug, first_name, last_name, nickname, role_name, membership, belt, stripe, weight, joined, phone)
where p.id = uuid_generate_v5(uuid_ns_dns(), x.slug || '.bjj-club-demo');

insert into public.belt_history (member_id, belt, stripe, assigned_by, note)
select p.id, p.belt, p.stripe,
       (select id from public.profiles where role = 'admin' limit 1),
       'wpis historyczny z danych demonstracyjnych'
from public.profiles p
where p.id like 'a0ee%' or p.id is not null
on conflict do nothing;

-- ---------------------------------------------------------------- klub -----
update public.club_settings
   set name = 'BJJ Club Warszawa', city = 'Warszawa', checkin_token = 'club-demo-2026'
 where id = 1;

-- ------------------------------------------------------------- klasy -------
delete from public.class_templates;

insert into public.class_templates (id, name, class_type, level, weekday, start_time, duration_minutes, capacity, color, coach_id, description)
select
  t.id,
  t.name,
  t.class_type::public.class_type_t,
  t.level::public.level_t,
  t.weekday,
  t.start_time::time,
  t.duration,
  t.capacity,
  t.color,
  c.coach_id,
  t.description
from (values
  ('c0000000-0000-0000-0000-000000000001'::uuid, 'Gi All Levels',      'gi',        'all',         0, '19:30', 75, 18,    '#2F6FED', 'Trening gi dla każdego poziomu.'),
  ('c0000000-0000-0000-0000-000000000002'::uuid, 'No-Gi Fundamentals', 'no_gi',     'beginners',   1, '18:30', 60, 14,    '#10B981', 'Fundamenty bez gi: zapasy, przejścia, ucieczki.'),
  ('c0000000-0000-0000-0000-000000000003'::uuid, 'Zapasy i rzuty',     'no_gi',     'intermediate',2, '20:00', 60, 12,    '#F59E0B', 'Zapasnicze wejścia i rzuty.'),
  ('c0000000-0000-0000-0000-000000000004'::uuid, 'Competition Prep',   'competition','advanced',   3, '19:00', 90, 10,    '#EF4444', 'Przygotowanie startowe, ciężkie sparingi.'),
  ('c0000000-0000-0000-0000-000000000005'::uuid, 'Open Mat',           'open_mat',  'all',         5, '11:00', 90, null,  '#8B5CF6', 'Wolna mata — własne tematy i sparingi.'),
  ('c0000000-0000-0000-0000-000000000006'::uuid, 'Warunki i mobilność','conditioning','all',       4, '07:30', 45, 20,    '#06B6D4', 'Rozgrzewka, mobilność, siła pod matę.')
) as t(id, name, class_type, level, weekday, start_time, duration, capacity, color, description)
cross join lateral (
  select (select id from public.profiles where role = 'admin' limit 1) as coach_id
) c;

-- Zapiszmy prowadzącego: Magda prowadzi no-gi i zapasy, Tomek resztę.
update public.class_templates
   set coach_id = (select id from public.profiles where nickname is null and role = 'coach' limit 1)
 where name in ('No-Gi Fundamentals', 'Zapasy i rzuty');

select public.materialize_sessions((current_date - 35)::date, (current_date + 14)::date);

-- ---------------------------------------------------------- techniki -------
insert into public.techniques (name, category, class_type, usage_count) values
  ('Single leg',                'takedowns',   'no_gi',       14),
  ('Double leg',                'takedowns',   'no_gi',        9),
  ('Guard retention',           'guard',       null,          21),
  ('Closed guard submissions',  'submissions', 'gi',          12),
  ('Half guard passing',        'passing',     null,          11),
  ('Mount escape',              'guard',       null,           8),
  ('Triangle from guard',       'submissions', 'gi',          10),
  ('Armbar from mount',         'submissions', null,           7),
  ('Knee cut pass',             'passing',     'no_gi',        9),
  ('Collar elbow tie-up',       'wrestling',   'no_gi',       16),
  ('D'arce choke',              'submissions', 'no_gi',        5),
  ('Leg lock entries',          'submissions', 'no_gi',        6),
  ('Turtle defense',            'guard',       null,           4),
  ('Back take transitions',     'submissions', null,          13),
  ('Ankle pick defense',        'wrestling',   'no_gi',        3)
on conflict (name) do nothing;

-- --------------------------------------------------- historia frekwencji ---
-- Czterotygodniowa historia z realistycznym szumem: jedni chodzą 4x w tygodniu,
-- inni 1x, kilka osób zniknęło (że statystyki klubu miały co pokazać).
with members as (
  select id,
         case
           when role in ('coach','admin') then 0.95
           when joined_at > now() - interval '60 days' then 0.25
           when md5(id::text)::int % 7 = 0 then 0.15   -- "zniknięci"
           else 0.45 + (md5(id::text)::int % 40) / 100.0
         end as attendance_p
  from public.profiles
  where membership_status = 'active'
),
sessions_in_window as (
  select s.id, s.starts_at, s.class_template_id
  from public.sessions s
  where s.starts_at < now() and s.status <> 'cancelled'
)
insert into public.attendance (session_id, member_id, checked_in_at, source)
select siw.id, m.id, siw.starts_at + (random() * interval '20 minutes'), 'qr'
from members m
cross join sessions_in_window siw
where random() < m.attendance_p
on conflict (session_id, member_id) do nothing;

-- Kilka no-showów dla realizmu statystyk.
insert into public.no_shows (session_id, member_id)
select g.session_id, g.member_id
from public.signups g
where g.status = 'active'
limit 0;

-- ------------------------------------------------- zapisy na przyszłość ----
insert into public.signups (session_id, member_id, status)
select s.id, m.id, 'active'
from public.sessions s
cross join public.profiles m
where s.starts_at > now()
  and s.status = 'scheduled'
  and m.membership_status = 'active'
  and m.role = 'member'
  and random() < 0.35
on conflict (session_id, member_id) where status in ('active','waitlist') do nothing;

-- Rezerwa: na najbliższych No-Gi Fundamentals upchnij limit i dorzuć rezerwowych.
do $$
declare
  v_session uuid;
  v_capacity integer;
  v_taken integer;
begin
  select s.id into v_session
  from public.sessions s
  join public.class_templates t on t.id = s.class_template_id
  where t.name = 'No-Gi Fundamentals' and s.starts_at > now() and s.status = 'scheduled'
  order by s.starts_at limit 1;

  if v_session is null then
    return;
  end if;

  select public.session_effective_capacity(v_session) into v_capacity;
  select count(*) into v_taken from public.signups where session_id = v_session and status = 'active';

  -- Dopchać do limitu.
  insert into public.signups (session_id, member_id, status)
  select v_session, p.id, 'active'
  from public.profiles p
  where p.role = 'member' and p.membership_status = 'active'
    and not exists (select 1 from public.signups g where g.session_id = v_session and g.member_id = p.id)
  limit greatest(0, v_capacity - v_taken)
  on conflict (session_id, member_id) where status in ('active','waitlist') do nothing;

  -- I troje rezerwowych.
  insert into public.signups (session_id, member_id, status, waitlist_position)
  select v_session, p.id, 'waitlist', row_number() over ()
  from public.profiles p
  where p.role = 'member' and p.membership_status = 'active'
    and not exists (select 1 from public.signups g where g.session_id = v_session and g.member_id = p.id)
  limit 3
  on conflict (session_id, member_id) where status in ('active','waitlist') do nothing;
end;
$$;

-- -------------------------------------------------------------- ankiety ----
-- Ankieta otwarta na najbliższe No-Gi Fundamentals (żeby dało się głosować).
do $$
declare
  v_session uuid;
  v_coach uuid;
begin
  select s.id into v_session
  from public.sessions s
  join public.class_templates t on t.id = s.class_template_id
  where t.name = 'No-Gi Fundamentals' and s.starts_at > now() and s.status = 'scheduled'
  order by s.starts_at limit 1;

  select id into v_coach from public.profiles where role = 'coach' limit 1;

  if v_session is null then return; end if;

  insert into public.polls (session_id, created_by, status, closes_at)
  values (v_session, v_coach, 'open', v_session - interval '30 minutes')
  on conflict (session_id) do update set status = 'open', closes_at = excluded.closes_at;
end;
$$;

insert into public.poll_options (poll_id, label, technique_id, source, created_by, position)
select p.id, o.label, t.id, 'coach', p.created_by, o.pos
from public.polls p
join public.sessions s on s.id = p.session_id
join public.class_templates ct on ct.id = s.class_template_id
cross join (values
  ('Zapasy: collar tie i single leg', 0),
  ('Guard retention z half guard',    1),
  ('Przejścia: knee cut i torreado',  2)
) as o(label, pos)
left join public.techniques t on t.name = case o.pos
  when 0 then 'Collar elbow tie-up'
  when 1 then 'Guard retention'
  when 2 then 'Knee cut pass'
end
where p.status = 'open'
on conflict (poll_id, lower(label)) do nothing;

-- Głosy członków zapisanych na te zajęcia.
insert into public.poll_votes (poll_id, member_id, option_id)
select po.poll_id, g.member_id, po.id
from public.poll_options po
join public.polls p on p.id = po.poll_id
join public.signups g on g.session_id = p.session_id and g.status = 'active'
where po.position = (g.member_id::text > '8')::int  -- deterministyczny, ale rozrzucony podział
on conflict (poll_id, member_id) do nothing;

-- Zamknięta ankieta na ostatnich zajęciach (wynik do przejrzenia w historii).
do $$
declare
  v_session uuid;
  v_poll uuid;
  v_coach uuid;
begin
  select s.id into v_session
  from public.sessions s
  join public.class_templates t on t.id = s.class_template_id
  where t.name = 'Gi All Levels' and s.starts_at < now() and s.status <> 'cancelled'
  order by s.starts_at desc limit 1;

  select id into v_coach from public.profiles where role = 'coach' limit 1;
  if v_session is null then return; end if;

  insert into public.polls (session_id, created_by, status, closes_at)
  values (v_session, v_coach, 'closed', v_session - interval '30 minutes')
  on conflict (session_id) do nothing
  returning id into v_poll;

  insert into public.poll_options (poll_id, label, technique_id, source, created_by, position)
  select v_poll, o.label, t.id, 'coach', v_coach, o.pos
  from (values ('Back take transitions', 0), ('Closed guard submissions', 1), ('Single leg', 2)) as o(label, pos)
  left join public.techniques t on t.name = o.label
  on conflict (poll_id, lower(label)) do nothing;

  update public.polls
     set decided_option_id = (select id from public.poll_options where poll_id = v_poll order by position limit 1)
   where id = v_poll;
end;
$$;

-- Tablica sparingowa na najbliższe zajęcia.
insert into public.sparring_intents (session_id, member_id, intensity, focus)
select s.id, p.id,
       (array['light','technical','hard'])[(md5(p.id::text)::int % 3) + 1],
       (array['any','takedowns','guard','passing','submissions','wrestling'])[(md5(p.id::text)::int % 6) + 1]
from public.sessions s
cross join public.profiles p
where s.status = 'scheduled'
  and s.starts_at = (
    select min(x.starts_at) from public.sessions x
    where x.status = 'scheduled' and x.starts_at > now() - interval '4 hours'
  )
  and p.role = 'member' and p.membership_status = 'active'
  and md5(p.id::text)::int % 2 = 0
on conflict (session_id, member_id) do nothing;

-- Podsumowanie
select
  (select count(*) from public.profiles)          as profile,
  (select count(*) from public.class_templates)   as klasy,
  (select count(*) from public.sessions)          as sesje,
  (select count(*) from public.attendance)        as frekwencja,
  (select count(*) from public.signups)           as zapisy,
  (select count(*) from public.techniques)        as techniki;
