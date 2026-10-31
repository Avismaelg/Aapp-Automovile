-- Convoy en tiempo real y retos por llegada que se resuelven solos.
--
-- 1. La party recuerda quién fijó el destino y cuándo: los demás reciben
--    «Ana fijó el destino» y siguen la misma ruta con un toque.
-- 2. Los retos guardan la meta (end_lat/end_lng). Cada piloto informa de su
--    avance; al llegar a la meta el servidor le asigna el puesto (sin
--    carreras entre dos que llegan a la vez) y, cuando llegan todos, cierra
--    el reto.

alter table public.parties
  add column if not exists destination_set_by uuid references public.profiles(id) on delete set null,
  add column if not exists destination_set_at timestamptz;

create or replace function private.set_party_destination(p_party_id uuid, p_label text, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_host uuid; v_is_member boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select host_id into v_host from public.parties where id = p_party_id;
  if v_host is null then raise exception 'party_not_found'; end if;
  select exists(select 1 from public.party_members where party_id = p_party_id and user_id = v_uid and left_at is null) into v_is_member;
  if v_host <> v_uid and not v_is_member then raise exception 'not_a_member'; end if;
  update public.parties
     set destination_label = nullif(trim(coalesce(p_label, '')), ''),
         destination_lat = p_lat,
         destination_lng = p_lng,
         destination_set_by = v_uid,
         destination_set_at = now()
   where id = p_party_id;
end;
$$;

alter table public.challenges
  add column if not exists end_lat double precision check (end_lat between -90 and 90),
  add column if not exists end_lng double precision check (end_lng between -180 and 180);

create or replace function private.report_challenge_progress(
  p_challenge_id uuid,
  p_progress numeric,
  p_arrived boolean
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_challenge public.challenges;
  v_rank integer;
  v_status text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  -- Bloquea el reto: dos llegadas a la vez no pueden sacar el mismo puesto.
  select * into v_challenge from public.challenges where id = p_challenge_id for update;
  if v_challenge.id is null or v_challenge.status <> 'live' then raise exception 'challenge_not_live'; end if;

  select status, finish_rank into v_status, v_rank
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid;
  if v_status is null then raise exception 'not_a_participant'; end if;
  if v_status = 'finished' then return v_rank; end if;
  if v_status <> 'accepted' then raise exception 'not_accepted'; end if;

  if p_arrived then
    select coalesce(max(finish_rank), 0) + 1 into v_rank
    from public.challenge_participants where challenge_id = p_challenge_id;
    update public.challenge_participants
       set status = 'finished', progress_pct = 100, finish_rank = v_rank, finished_at = now(),
           elapsed_s = greatest(0, extract(epoch from now() - coalesce(v_challenge.starts_at, v_challenge.created_at))::integer)
     where challenge_id = p_challenge_id and user_id = v_uid;
    -- Llegaron todos los que aceptaron: el reto termina.
    if not exists (
      select 1 from public.challenge_participants
      where challenge_id = p_challenge_id and status = 'accepted'
    ) then
      update public.challenges set status = 'finished', finished_at = now() where id = p_challenge_id;
    end if;
    return v_rank;
  end if;

  -- El avance solo sube (un desvío no te hace retroceder en la tabla).
  update public.challenge_participants
     set progress_pct = greatest(progress_pct, least(99, greatest(0, p_progress))),
         elapsed_s = greatest(0, extract(epoch from now() - coalesce(v_challenge.starts_at, v_challenge.created_at))::integer)
   where challenge_id = p_challenge_id and user_id = v_uid;
  return null;
end;
$$;

create or replace function public.report_challenge_progress(p_challenge_id uuid, p_progress numeric, p_arrived boolean)
returns integer language sql security invoker set search_path = public, private as $$
  select private.report_challenge_progress(p_challenge_id, p_progress, p_arrived);
$$;

revoke all on function private.report_challenge_progress(uuid, numeric, boolean) from public, anon;
revoke all on function public.report_challenge_progress(uuid, numeric, boolean) from public, anon;
grant execute on function private.report_challenge_progress(uuid, numeric, boolean) to authenticated;
grant execute on function public.report_challenge_progress(uuid, numeric, boolean) to authenticated;
