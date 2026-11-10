-- Auditoría de seguridad (fase 2).

-- 2.1 · email_registered permitía a cualquiera (con la clave pública)
-- averiguar qué correos tienen cuenta. El alta ya detecta el correo repetido
-- al final (signUp) y la app ya no la usa: se quitan los permisos y el
-- envoltorio público (la función interna queda sin acceso para nadie).
revoke all on function public.email_registered(text) from public, anon, authenticated;
revoke all on function private.email_registered(text) from public, anon, authenticated;
drop function if exists public.email_registered(text);

-- 2.2 · Ganar un reto exige estar en la meta: si el reto tiene meta, la
-- llegada sin posición, lejos de la meta o en un tiempo imposible se rechaza
-- (antes, sin posición se aceptaba y daba el primer puesto desde casa).
create or replace function private.report_challenge_progress(
  p_challenge_id uuid,
  p_progress numeric,
  p_arrived boolean,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m numeric default null,
  p_eta_s integer default null
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_challenge public.challenges;
  v_rank integer;
  v_status text;
  v_distance double precision;
  v_elapsed integer;
  v_verified boolean := false;
  -- Radio de llegada (como ARRIVE_RADIUS_M en la app) más margen por la precisión.
  c_arrive_m constant double precision := 60;
  c_max_accuracy_m constant numeric := 50;
  -- Más rápido que esto de media hasta la meta no es coherente.
  c_max_avg_mps constant double precision := 150 / 3.6;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_challenge from public.challenges where id = p_challenge_id for update;
  if v_challenge.id is null or v_challenge.status <> 'live' then raise exception 'challenge_not_live'; end if;
  if v_challenge.starts_at is not null and v_challenge.starts_at > now() then
    raise exception 'challenge_not_started';
  end if;

  select status, finish_rank into v_status, v_rank
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid;
  if v_status is null then raise exception 'not_a_participant'; end if;
  if v_status = 'finished' then return v_rank; end if;
  if v_status <> 'accepted' then raise exception 'not_accepted'; end if;

  v_elapsed := greatest(0, extract(epoch from now() - coalesce(v_challenge.starts_at, v_challenge.created_at))::integer);

  if p_arrived then
    if v_challenge.end_lat is not null and v_challenge.end_lng is not null then
      if p_lat is null or p_lng is null then raise exception 'position_required'; end if;
      if abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'invalid_position'; end if;
      -- Distancia a la meta (haversine, metros).
      v_distance := 2 * 6371000 * asin(sqrt(
        power(sin(radians(p_lat - v_challenge.end_lat) / 2), 2)
        + cos(radians(v_challenge.end_lat)) * cos(radians(p_lat))
          * power(sin(radians(p_lng - v_challenge.end_lng) / 2), 2)
      ));
      if v_distance > c_arrive_m + least(coalesce(p_accuracy_m, c_max_accuracy_m), c_max_accuracy_m) then
        raise exception 'not_at_finish';
      end if;
      if v_challenge.distance_m > 0 and v_elapsed < v_challenge.distance_m / c_max_avg_mps then
        raise exception 'impossible_time';
      end if;
      v_verified := coalesce(p_accuracy_m, c_max_accuracy_m + 1) <= c_max_accuracy_m;
    end if;

    select coalesce(max(finish_rank), 0) + 1 into v_rank
    from public.challenge_participants where challenge_id = p_challenge_id;
    update public.challenge_participants
       set status = 'finished', progress_pct = 100, finish_rank = v_rank, finished_at = now(),
           last_progress_at = now(), elapsed_s = v_elapsed,
           arrival_verified = v_verified,
           arrival_distance_m = case when v_distance is null then null else round(v_distance)::integer end
     where challenge_id = p_challenge_id and user_id = v_uid;
    perform private.close_challenge_if_done(p_challenge_id);
    return v_rank;
  end if;

  -- El avance solo sube (un desvío no te hace retroceder en la tabla).
  update public.challenge_participants
     set progress_pct = greatest(progress_pct, least(99, greatest(0, p_progress))),
         last_progress_at = now(),
         elapsed_s = v_elapsed,
         eta_s = case when p_eta_s between 0 and 86400 then p_eta_s else eta_s end,
         eta_at = case when p_eta_s between 0 and 86400 then now() else eta_at end
   where challenge_id = p_challenge_id and user_id = v_uid;
  return null;
end;
$$;

revoke all on function private.report_challenge_progress(uuid, numeric, boolean, double precision, double precision, numeric, integer) from public, anon;
grant execute on function private.report_challenge_progress(uuid, numeric, boolean, double precision, double precision, numeric, integer) to authenticated;

-- 2.3 · Cuotas de Google: los topes los fija el servidor, no quien llama.
-- Antes bastaba llamar a la función por la API (sin pasar por la Edge
-- Function) 150 veces, o con p_global_limit = 1, para dejar sin buscador o
-- sin rutas a toda la app ese día. Ahora cada uno gasta como mucho su cupo
-- y solo dentro de él cuenta para el total de la app. Los parámetros se
-- conservan para no romper a quien llama, pero se ignoran.
create or replace function private.bump_place_search(p_limit integer, p_global_limit integer default 300)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_user_cap constant integer := 300;
  v_global_cap constant integer := 300;
  v_count integer;
  v_global integer;
begin
  if v_uid is null then return false; end if;

  insert into public.place_search_usage (user_id, day, count)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set count = public.place_search_usage.count + 1
  returning count into v_count;
  if v_count > v_user_cap then return false; end if;

  insert into public.place_search_global (day, count) values (v_day, 1)
  on conflict (day) do update set count = public.place_search_global.count + 1
  returning count into v_global;
  delete from public.place_search_usage where user_id = v_uid and day < v_day - 7;
  delete from public.place_search_global where day < v_day - 40;
  return v_global <= v_global_cap;
end;
$$;

create or replace function private.bump_route_quota(p_limit integer, p_global_limit integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_global constant uuid := '00000000-0000-0000-0000-000000000000';
  v_user_cap constant integer := 60;
  v_global_cap constant integer := 150;
  v_count integer;
  v_total integer;
begin
  if v_uid is null then return false; end if;

  insert into public.route_quota (day, user_id, count) values (v_day, v_uid, 1)
  on conflict (day, user_id) do update set count = public.route_quota.count + 1
  returning count into v_count;
  if v_count > v_user_cap then return false; end if;

  insert into public.route_quota (day, user_id, count) values (v_day, v_global, 1)
  on conflict (day, user_id) do update set count = public.route_quota.count + 1
  returning count into v_total;
  delete from public.route_quota where day < v_day - 40;
  return v_total <= v_global_cap;
end;
$$;

revoke all on function private.bump_place_search(integer, integer) from public, anon;
revoke all on function private.bump_route_quota(integer, integer) from public, anon;
grant execute on function private.bump_place_search(integer, integer) to authenticated;
grant execute on function private.bump_route_quota(integer, integer) to authenticated;

-- 2.4 · Unirse a un club: solo como miembro y solo a clubs públicos; el
-- dueño puede darse de alta en el suyo con cualquier rol. Antes
-- cualquiera entraba en un club privado o se ponía owner/admin.
drop policy if exists club_members_insert on public.club_members;
create policy club_members_insert on public.club_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (role = 'member' and exists (select 1 from public.clubs c where c.id = club_id and c.privacy = 'public'))
      or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = (select auth.uid()))
    )
  );
