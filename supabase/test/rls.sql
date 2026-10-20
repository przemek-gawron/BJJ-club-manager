-- ============================================================================
--  Testy polityk RLS — uruchamiane jako `authenticated`, z JWT podstawionym przez
--  auth.uid() (dokładnie tak, jak robi to Supabase dla klienta REST).
--
--  Kluczowe: testy NIE mogą biegać jako właściciel tabel, bo właściciel omija RLS
--  i wszystko przechodziłoby fałszywie.
--
--  Odpal: supabase/test/run-rls.sh
-- ============================================================================

\set ON_ERROR_STOP on

-- Identyfikatory kont demo są stałe (uuid5 ze sluga w seed.sql), więc wyliczamy je
-- wprost. Nie możemy ich SELECT-ować z profiles: test zaczyna bez toku, a po zaostrzeniu
-- polityki nic z tej tabeli nie jest wtedy widoczne.
create or replace function public._demo_id(p_slug text)
returns uuid
language sql
immutable
as $$ select uuid_generate_v5(uuid_ns_dns(), p_slug || '.bjj-club-demo') $$;

set role authenticated;

do $$
declare
  v_member  uuid := public._demo_id('kuba');
  v_other   uuid := public._demo_id('ola');
  v_coach   uuid := public._demo_id('magda');
  v_admin   uuid := public._demo_id('tomasz');
  v_count   bigint;
  v_session uuid;
  v_fails   text := '';
begin
  -- Konta muszą istnieć — inaczej seed nie przeszedł. Sprawdzamy je jako kadra,
  -- bo członek bez toku i tak by ich nie zobaczył.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, false);
  select count(*) into v_count from public.profiles where id = any (array[v_member, v_other, v_coach, v_admin]);
  if v_count <> 4 then
    raise exception 'RLS: brakuje kont demo (znaleziono % z 4) — odpal najpierw rebuild.sh', v_count;
  end if;

  ---------------------------------------------------------------- --
  -- 1. Zwykły członek nie może wyczytać profili innych osób
  ---------------------------------------------------------------- --
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_member, 'role', 'authenticated')::text, false);

  select count(*) into v_count from public.profiles;
  if v_count <> 1 then
    v_fails := v_fails || format('profiles: członek widzi %s wierszy, powinno być 1 (tylko swój); ', v_count);
  end if;

  select count(*) into v_count from public.profiles p where p.email is not null;
  if v_count <> 1 then
    v_fails := v_fails || format('profiles: członek czyta e-maile %s osób; ', v_count);
  end if;

  -- Telefon kadry i notatki trenera to dane, do których członek nie ma prawa.
  select count(*) into v_count from public.profiles p where p.phone is not null;
  if v_count > 0 then
    v_fails := v_fails || format('profiles: członek czyta telefony %s osób; ', v_count);
  end if;

  select count(*) into v_count from public.profiles p where p.notes is not null;
  if v_count > 0 then
    v_fails := v_fails || format('profiles: członek czyta notatki trenera %s osób; ', v_count);
  end if;

  -- Katalog klubu (widok bez kontaktu) musi zostać w pełni widoczny.
  select count(*) into v_count from public.members_public;
  if v_count < 10 then
    v_fails := v_fails || format('members_public: katalog zwraca %s osób, klub ma ich więcej; ', v_count);
  end if;

  -- Widok pełnego profilu nie powinien istnieć (omijał RLS i ujawniał kontakt).
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'members_staff') then
    v_fails := v_fails || 'members_staff: widok z pełnymi danymi nadal istnieje; ';
  end if;

  ---------------------------------------------------------------- --
  -- 2. Kadra widzi profile w całości
  ---------------------------------------------------------------- --
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_coach, 'role', 'authenticated')::text, false);

  select count(*) into v_count from public.profiles;
  if v_count < 10 then
    v_fails := v_fails || format('profiles: trener widzi %s wierszy, powinien widzieć cały klub; ', v_count);
  end if;

  ---------------------------------------------------------------- --
  -- 3. Zapisy: członek zapisuje się tylko na siebie i tylko na przyszłe zajęcia
  ---------------------------------------------------------------- --
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_member, 'role', 'authenticated')::text, false);

  select s.id into v_session
  from public.sessions s
  where s.status = 'scheduled' and s.starts_at > now() + interval '1 day'
  order by s.starts_at limit 1;

  if v_session is not null then
    begin
      insert into public.signups (session_id, member_id, status) values (v_session, v_other, 'active');
      v_fails := v_fails || 'signups: członek wstawił zapis ZA INNĄ OSOBĘ; ';
    exception when insufficient_privilege or check_violation then
      null; -- tak ma być
    end;
  end if;

  ---------------------------------------------------------------- --
  -- 4. Frekwencji nie da się wpisać bezpośrednio — tylko przez RPC
  ---------------------------------------------------------------- --
  begin
    insert into public.attendance (session_id, member_id, source)
    values (coalesce(v_session, gen_random_uuid()), v_member, 'qr');
    v_fails := v_fails || 'attendance: członek wstawił frekwencję bezpośrednim insertem; ';
  exception when insufficient_privilege then
    null; -- polityka staff blokuje — dobrze
  end;

  ---------------------------------------------------------------- --
  -- 5. Tokena QR nie da się podejrzeć ani obrócić bez uprawnień admina
  ---------------------------------------------------------------- --
  begin
    perform public.rotate_checkin_token();
  exception when others then
    v_fails := v_fails || format('rotate_checkin_token: rzucił wyjątek zamiast odmowy (%s); ', sqlerrm);
  end;

  ---------------------------------------------------------------- --
  -- 6. Admin może obrócić token
  ---------------------------------------------------------------- --
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, false);
  if not (select public.rotate_checkin_token() ->> 'ok')::boolean then
    v_fails := v_fails || 'rotate_checkin_token: admin nie mógł obrócić tokenu; ';
  end if;

  -- Ankieta: członek nie zatwierdzi wyniku (RPC ma sprawdzać rolę).
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_member, 'role', 'authenticated')::text, false);
  declare
    v_poll   uuid;
    v_option uuid;
    v_res    jsonb;
  begin
    select p.id into v_poll from public.polls p where p.status = 'open' limit 1;
    if v_poll is not null then
      select o.id into v_option from public.poll_options o where o.poll_id = v_poll limit 1;
      v_res := public.decide_poll(v_poll, v_option);
      if (v_res ->> 'ok')::boolean then
        v_fails := v_fails || 'decide_poll: zwykły członek zatwierdził wynik ankiety; ';
      end if;
    end if;
  end;

  perform set_config('request.jwt.claims', '', false);

  if v_fails <> '' then
    raise exception 'RLS FAILED: %', v_fails;
  else
    raise notice 'RLS OK — wszystkie polityki zachowują się zgodnie z oczekiwaniami';
  end if;
end
$$;
