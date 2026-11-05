-- RETO-05 (enmienda 1.1): clasificación de un reto en carrera por el tiempo
-- real que le falta a cada piloto para llegar, no por el % de avance en línea
-- recta. Cada informe de avance trae su ETA (la de la ruta con tráfico si
-- navega hacia la meta; si no, una estimación por distancia). Los que ya
-- llegaron siguen ordenados por su puesto.

alter table public.challenge_participants
  add column if not exists eta_s integer check (eta_s >= 0),
  add column if not exists eta_at timestamptz;

drop function if exists public.report_challenge_progress(uuid, numeric, boolean, double precision, double precision, numeric);
drop function if exists private.report_challenge_progress(uuid, numeric, boolean, double precision, double precision, numeric);

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
    if p_lat is not null and p_lng is not null and v_challenge.end_lat is not null and v_challenge.end_lng is not null then
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
      v_verified := coalesce(p_accuracy_m, c_max_accuracy_m + 1) <= c_max_accuracy_m
        and (v_challenge.distance_m = 0 or v_elapsed >= v_challenge.distance_m / c_max_avg_mps);
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
  -- RETO-05: tiempo estimado hasta la meta (el de la ruta con tráfico si vas
  -- navegando hacia ella); la clasificación en carrera se ordena por él.
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

create or replace function public.report_challenge_progress(
  p_challenge_id uuid,
  p_progress numeric,
  p_arrived boolean,
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy_m numeric default null,
  p_eta_s integer default null
) returns integer language sql security invoker set search_path = public, private as $$
  select private.report_challenge_progress(p_challenge_id, p_progress, p_arrived, p_lat, p_lng, p_accuracy_m, p_eta_s);
$$;

revoke all on function private.report_challenge_progress(uuid, numeric, boolean, double precision, double precision, numeric, integer) from public, anon;
revoke all on function public.report_challenge_progress(uuid, numeric, boolean, double precision, double precision, numeric, integer) from public, anon;
grant execute on function private.report_challenge_progress(uuid, numeric, boolean, double precision, double precision, numeric, integer) to authenticated;
grant execute on function public.report_challenge_progress(uuid, numeric, boolean, double precision, double precision, numeric, integer) to authenticated;
