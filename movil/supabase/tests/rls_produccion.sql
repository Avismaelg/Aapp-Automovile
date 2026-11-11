-- Prueba REAL de las políticas (docs/PRUEBAS-PRODUCCION.md). Ejecutar SOLO en
-- un proyecto de Supabase de pruebas (staging), nunca en producción, como
-- postgres (SQL Editor o Management API). Crea 3 usuarios de prueba, intenta
-- cada ataque de los P0 con su sesión simulada (rol authenticated o anon +
-- request.jwt.claims), apunta el resultado y borra todo lo que creó.
--
-- Resultado: una fila por comprobación (ok = la política resistió).

create temp table if not exists rls_results (check_name text, ok boolean, detail text);
truncate rls_results;

-- Usuarios: A (anfitrión), B (atacante), C (víctima de la amistad).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('00000000-0000-4000-a000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@caravana.test', '', '{"username":"rls_test_a","display_name":"RLS A","vehicle":{"make":"Test","model":"A","plate":"RLS-A1"}}', now(), now(), now()),
  ('00000000-0000-4000-a000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@caravana.test', '', '{"username":"rls_test_b","display_name":"RLS B"}', now(), now(), now()),
  ('00000000-0000-4000-a000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-c@caravana.test', '', '{"username":"rls_test_c","display_name":"RLS C"}', now(), now(), now())
on conflict (id) do nothing;

-- Datos de partida (como postgres).
insert into public.profiles (id, username, display_name)
values ('00000000-0000-4000-a000-00000000000a', 'rls_test_a', 'RLS A'),
       ('00000000-0000-4000-a000-00000000000b', 'rls_test_b', 'RLS B'),
       ('00000000-0000-4000-a000-00000000000c', 'rls_test_c', 'RLS C')
on conflict (id) do nothing;
insert into public.vehicles (id, owner_id, make, model, plate, privacy)
values ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'Test', 'A', 'RLS-A1', 'public')
on conflict (id) do nothing;
insert into public.parties (id, host_id, name, status, invite_code, voice_room, is_private)
values ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'RLS', 'live', 'RLSTST', 'party_rls_test', false)
on conflict (id) do nothing;
insert into public.party_members (party_id, user_id, role)
values ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'host')
on conflict do nothing;
insert into public.friendships (id, requester_id, addressee_id, status)
values ('00000000-0000-4000-d000-00000000000b', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000c', 'pending')
on conflict (id) do nothing;

-- P0-1a: B se da de alta solo en el convoy de A.
do $$ declare v_ok boolean; v_msg text; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    insert into public.party_members (party_id, user_id, role)
    values ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-a000-00000000000b', 'member');
    v_ok := false; v_msg := 'insertó';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('P0-1 alta directa en convoy ajeno', v_ok, v_msg);
end $$;

-- P0-1b: B entra con el código y se intenta poner de anfitrión.
do $$ declare v_ok boolean; v_msg text; v_rows integer; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  perform public.join_party('RLSTST');
  begin
    update public.party_members set role = 'host'
     where party_id = '00000000-0000-4000-c000-00000000000a' and user_id = '00000000-0000-4000-a000-00000000000b';
    get diagnostics v_rows = row_count;
    v_ok := v_rows = 0; v_msg := v_rows || ' filas';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('P0-1 cambiarse el rol a anfitrión', v_ok, v_msg);
end $$;

-- P0-1c: A expulsa a B; B intenta volver (con update y con el código).
do $$ declare v_ok boolean; v_msg text; v_rows integer; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
  execute 'set local role authenticated';
  perform public.kick_party_member('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-a000-00000000000b');
  execute 'reset role';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    update public.party_members set left_at = null
     where party_id = '00000000-0000-4000-c000-00000000000a' and user_id = '00000000-0000-4000-a000-00000000000b';
    -- Tras la expulsión la RLS ya no le deja ver su fila: 0 filas = resistió.
    get diagnostics v_rows = row_count;
    v_ok := v_rows = 0; v_msg := v_rows || ' filas con update';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  if v_ok then
    begin
      perform public.join_party('RLSTST');
      v_ok := false; v_msg := 'volvió con el código';
    exception when others then v_msg := v_msg || ' / ' || sqlerrm; end;
  end if;
  execute 'reset role';
  insert into rls_results values ('P0-1 volver tras ser expulsado', v_ok, v_msg);
end $$;

-- P0-2: B (remitente) se acepta su propia solicitud a C.
do $$ declare v_ok boolean; v_msg text; v_rows integer; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    update public.friendships set status = 'accepted' where id = '00000000-0000-4000-d000-00000000000b';
    get diagnostics v_rows = row_count;
    v_ok := v_rows = 0; v_msg := v_rows || ' filas';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('P0-2 aceptarse la propia solicitud', v_ok, v_msg);
end $$;

-- P0-3: matrícula de un vehículo público, como visitante y como otro usuario.
do $$ declare v_ok boolean; v_msg text; v_plate text; begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    select plate into v_plate from public.vehicles where id = '00000000-0000-4000-b000-00000000000a';
    v_ok := v_plate is null; v_msg := coalesce(v_plate, 'nula');
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('P0-3 matrícula como visitante', v_ok, v_msg);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    select plate into v_plate from public.vehicles where id = '00000000-0000-4000-b000-00000000000a';
    v_ok := v_plate is null; v_msg := coalesce(v_plate, 'nula');
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('P0-3 matrícula como otro usuario', v_ok, v_msg);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
  execute 'set local role authenticated';
  select plate into v_plate from public.my_vehicle_plates() where vehicle_id = '00000000-0000-4000-b000-00000000000a';
  execute 'reset role';
  insert into rls_results values ('P0-3 el dueño sí ve su matrícula', v_plate = 'RLS-A1', coalesce(v_plate, 'nula'));
end $$;

-- P0-4: velocidades de otros.
do $$ declare v_ok boolean; v_msg text; v_count integer; begin
  insert into public.speed_records (segment_id, user_id, user_name, max_speed_kmh, is_public)
  select id, '00000000-0000-4000-a000-00000000000a', 'RLS A', 90, true from public.highway_segments limit 1;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    select count(*) into v_count from public.speed_records where user_id = '00000000-0000-4000-a000-00000000000a';
    v_ok := v_count = 0; v_msg := v_count || ' filas';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('P0-4 leer velocidades ajenas', v_ok, v_msg);
end $$;

-- Fase 2 · 2.2: B «llega» a la meta de un reto sin posición, lejos de ella o
-- en un tiempo imposible. Reto 1: empezó hace 1 h (10 km). Reto 2: hace 10 s.
insert into public.challenges (id, host_id, title, from_label, to_label, status, starts_at, distance_m, end_lat, end_lng)
values
  ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'RLS 1', 'A', 'B', 'live', now() - interval '1 hour', 10000, 18.48, -69.93),
  ('00000000-0000-4000-e000-00000000000b', '00000000-0000-4000-a000-00000000000a', 'RLS 2', 'A', 'B', 'live', now() - interval '10 seconds', 10000, 18.48, -69.93)
on conflict (id) do nothing;
insert into public.challenge_participants (challenge_id, user_id, status)
values ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-a000-00000000000b', 'accepted'),
       ('00000000-0000-4000-e000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'accepted')
on conflict do nothing;

do $$ declare v_ok boolean; v_msg text; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    perform public.report_challenge_progress('00000000-0000-4000-e000-00000000000a', 100, true);
    v_ok := false; v_msg := 'ganó sin posición';
  exception when others then v_ok := sqlerrm = 'position_required'; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('2.2 llegar a la meta sin posición', v_ok, v_msg);

  execute 'set local role authenticated';
  begin
    perform public.report_challenge_progress('00000000-0000-4000-e000-00000000000a', 100, true, 18.60, -69.93, 5);
    v_ok := false; v_msg := 'ganó lejos de la meta';
  exception when others then v_ok := sqlerrm = 'not_at_finish'; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('2.2 llegar lejos de la meta', v_ok, v_msg);

  execute 'set local role authenticated';
  begin
    perform public.report_challenge_progress('00000000-0000-4000-e000-00000000000b', 100, true, 18.48, -69.93, 5);
    v_ok := false; v_msg := 'ganó 10 km en 10 s';
  exception when others then v_ok := sqlerrm = 'impossible_time'; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('2.2 llegar en un tiempo imposible', v_ok, v_msg);

  execute 'set local role authenticated';
  begin
    v_ok := public.report_challenge_progress('00000000-0000-4000-e000-00000000000a', 100, true, 18.48, -69.93, 5) = 1;
    v_msg := 'puesto 1';
  exception when others then v_ok := false; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('2.2 la llegada legítima sí cuenta', v_ok, v_msg);
end $$;

-- Fase 2 · 2.4: B se mete de owner en un club público de A y de miembro en
-- uno privado; como miembro en el público sí puede.
insert into public.clubs (id, owner_id, name, slug, privacy)
values ('00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'RLS público', 'rls-test-publico', 'public'),
       ('00000000-0000-4000-f000-00000000000b', '00000000-0000-4000-a000-00000000000a', 'RLS privado', 'rls-test-privado', 'private')
on conflict (id) do nothing;

do $$ declare v_ok boolean; v_msg text; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    insert into public.club_members (club_id, user_id, role)
    values ('00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-a000-00000000000b', 'owner');
    v_ok := false; v_msg := 'se hizo owner';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('2.4 hacerse owner de un club ajeno', v_ok, v_msg);

  execute 'set local role authenticated';
  begin
    insert into public.club_members (club_id, user_id, role)
    values ('00000000-0000-4000-f000-00000000000b', '00000000-0000-4000-a000-00000000000b', 'member');
    v_ok := false; v_msg := 'entró en el privado';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('2.4 entrar en un club privado', v_ok, v_msg);

  execute 'set local role authenticated';
  begin
    insert into public.club_members (club_id, user_id, role)
    values ('00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-a000-00000000000b', 'member');
    v_ok := true; v_msg := 'entró';
  exception when others then v_ok := false; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('2.4 unirse a un club público sí se puede', v_ok, v_msg);
end $$;

-- Auditoría final · B2: A bloquea a B. B deja de ver lo público de A
-- (publicaciones y vehículos) y no puede colgar una quedada en un club de A.
insert into public.posts (id, user_id, visibility)
values ('00000000-0000-4000-9000-00000000000a', '00000000-0000-4000-a000-00000000000a', 'public')
on conflict (id) do nothing;
insert into public.blocks (blocker_id, blocked_id)
values ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b')
on conflict do nothing;

-- B3: quedada privada de A para comprobar que B no se apunta solo con el id.
insert into public.meets (id, host_id, title, starts_at, privacy)
values ('00000000-0000-4000-9000-00000000000c', '00000000-0000-4000-a000-00000000000a',
        'Quedada privada de A', now() + interval '1 day', 'private')
on conflict (id) do nothing;

do $$ declare v_ok boolean; v_msg text; v_posts integer; v_vehicles integer; begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  select count(*) into v_posts from public.posts where user_id = '00000000-0000-4000-a000-00000000000a';
  select count(*) into v_vehicles from public.vehicles where owner_id = '00000000-0000-4000-a000-00000000000a';
  execute 'reset role';
  insert into rls_results values ('B2 bloqueado no ve publicaciones ni vehículos', v_posts = 0 and v_vehicles = 0,
    format('posts=%s vehicles=%s', v_posts, v_vehicles));

  -- A sí sigue viendo lo suyo.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
  execute 'set local role authenticated';
  select count(*) into v_posts from public.posts where user_id = '00000000-0000-4000-a000-00000000000a';
  execute 'reset role';
  insert into rls_results values ('B2 el dueño sigue viendo lo suyo', v_posts = 1, format('posts=%s', v_posts));

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    insert into public.meets (host_id, club_id, title, starts_at)
    values ('00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-f000-00000000000b', 'Quedada colada', now() + interval '1 day');
    v_ok := false; v_msg := 'creó la quedada';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('B2 quedada en un club ajeno', v_ok, v_msg);

  -- B3: B no puede apuntarse a una quedada privada de A solo con el id.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    insert into public.meet_attendees (meet_id, user_id)
    values ('00000000-0000-4000-9000-00000000000c', '00000000-0000-4000-a000-00000000000b');
    v_ok := false; v_msg := 'se apuntó a la quedada privada';
  exception when others then v_ok := true; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('B3 apuntarse a una quedada privada ajena', v_ok, v_msg);

  -- El anfitrión sí puede apuntarse a la suya.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    insert into public.meet_attendees (meet_id, user_id)
    values ('00000000-0000-4000-9000-00000000000c', '00000000-0000-4000-a000-00000000000a');
    v_ok := true; v_msg := 'ok';
  exception when others then v_ok := false; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('B3 el anfitrión sí se apunta a la suya', v_ok, v_msg);

  -- A4: llegar con una posición que no es un número (B es quien participa).
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    perform public.report_challenge_progress('00000000-0000-4000-e000-00000000000b', 100, true, 'NaN'::double precision, -69.93, 5);
    v_ok := false; v_msg := 'ganó con NaN';
  exception when others then v_ok := sqlerrm = 'invalid_position'; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('A4 llegar con posición NaN', v_ok, v_msg);

  -- B4: destino del convoy fuera de rango (A es el anfitrión).
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
  execute 'set local role authenticated';
  begin
    perform public.set_party_destination('00000000-0000-4000-c000-00000000000a', 'Roto', 'NaN'::double precision, -69.93);
    v_ok := false; v_msg := 'guardó NaN';
  exception when others then v_ok := sqlerrm = 'invalid_position'; v_msg := sqlerrm; end;
  execute 'reset role';
  insert into rls_results values ('B4 destino del convoy con NaN', v_ok, v_msg);
end $$;

-- B5: un solo usuario no puede agotar el cupo global de Places. A hace 61
-- llamadas: la 60 pasa y la 61 se corta. B todavía puede buscar.
delete from public.place_search_usage
 where day = (now() at time zone 'utc')::date
   and user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b');
delete from public.place_search_global where day = (now() at time zone 'utc')::date;

do $$ declare
  v_day date := (now() at time zone 'utc')::date;
  v_i integer;
  v_sixty boolean := false;
  v_last boolean := true;
  v_other boolean := false;
  v_global integer;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000a","role":"authenticated"}', true);
  execute 'set local role authenticated';
  for v_i in 1..61 loop
    select public.bump_place_search(60, 300) into v_last;
    if v_i = 60 then v_sixty := v_last; end if;
  end loop;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000000b","role":"authenticated"}', true);
  execute 'set local role authenticated';
  select public.bump_place_search(60, 300) into v_other;
  execute 'reset role';

  select g.count into v_global from public.place_search_global g where g.day = v_day;
  insert into rls_results values (
    'B5 un usuario no agota el cupo global de Places',
    v_sixty and not v_last and v_other and v_global = 61,
    format('llamada 60=%s llamada 61=%s otro usuario=%s global=%s', v_sixty, v_last, v_other, v_global)
  );
end $$;

delete from public.blocks where blocker_id = '00000000-0000-4000-a000-00000000000a';
delete from public.meets where host_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b')
   or id = '00000000-0000-4000-9000-00000000000c';
delete from public.posts where id = '00000000-0000-4000-9000-00000000000a';
-- La prueba de B5 deja el contador de hoy limpio para no alterar el cupo real.
delete from public.place_search_usage
 where day = (now() at time zone 'utc')::date
   and user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b');
delete from public.place_search_global where day = (now() at time zone 'utc')::date;

-- Limpieza: borrar los usuarios arrastra perfiles, vehículos, convoy y demás.
delete from public.speed_records where user_id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000c');
delete from public.parties where id = '00000000-0000-4000-c000-00000000000a';
delete from public.challenges where id in ('00000000-0000-4000-e000-00000000000a', '00000000-0000-4000-e000-00000000000b');
delete from public.clubs where id in ('00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-f000-00000000000b');
delete from auth.users where id in ('00000000-0000-4000-a000-00000000000a', '00000000-0000-4000-a000-00000000000b', '00000000-0000-4000-a000-00000000000c');

select check_name, ok, detail from rls_results order by check_name;
