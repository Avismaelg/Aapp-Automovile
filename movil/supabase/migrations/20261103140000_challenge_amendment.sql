-- Retos (enmienda 1.1).
--
-- RETO-04: el anfitrión inicia con cuenta atrás (starts_at en el futuro). El
--   avance no cuenta antes de la salida.
-- RETO-07: un participante puede abandonar (y el reto sigue para los demás);
--   «sin conexión» se ve por la hora de su último avance (last_progress_at).

alter table public.challenge_participants
  add column if not exists last_progress_at timestamptz;

-- Quita el CHECK de estados anterior, se llame como se llame.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.challenge_participants'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%invited%'
  loop
    execute format('alter table public.challenge_participants drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.challenge_participants
  add constraint challenge_participants_status_check
  check (status in ('invited', 'accepted', 'declined', 'finished', 'cancelled', 'abandoned'));

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
  -- Durante la cuenta atrás todavía no se puede avanzar ni llegar.
  if v_challenge.starts_at is not null and v_challenge.starts_at > now() then
    raise exception 'challenge_not_started';
  end if;

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
           last_progress_at = now(),
           elapsed_s = greatest(0, extract(epoch from now() - coalesce(v_challenge.starts_at, v_challenge.created_at))::integer)
     where challenge_id = p_challenge_id and user_id = v_uid;
    perform private.close_challenge_if_done(p_challenge_id);
    return v_rank;
  end if;

  -- El avance solo sube (un desvío no te hace retroceder en la tabla).
  update public.challenge_participants
     set progress_pct = greatest(progress_pct, least(99, greatest(0, p_progress))),
         last_progress_at = now(),
         elapsed_s = greatest(0, extract(epoch from now() - coalesce(v_challenge.starts_at, v_challenge.created_at))::integer)
   where challenge_id = p_challenge_id and user_id = v_uid;
  return null;
end;
$$;

-- Llegaron (o abandonaron) todos los que seguían: el reto termina.
create or replace function private.close_challenge_if_done(p_challenge_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and status = 'accepted'
  ) then
    update public.challenges set status = 'finished', finished_at = now()
     where id = p_challenge_id and status = 'live';
  end if;
end;
$$;

create or replace function private.abandon_challenge(p_challenge_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.challenge_participants
     set status = 'abandoned', finished_at = now()
   where challenge_id = p_challenge_id and user_id = auth.uid() and status = 'accepted';
  perform private.close_challenge_if_done(p_challenge_id);
end;
$$;

create or replace function public.abandon_challenge(p_challenge_id uuid) returns void
language sql security invoker set search_path = public, private as $$
  select private.abandon_challenge(p_challenge_id);
$$;

revoke all on function private.close_challenge_if_done(uuid) from public, anon, authenticated;
revoke all on function private.abandon_challenge(uuid) from public, anon;
revoke all on function public.abandon_challenge(uuid) from public, anon;
grant execute on function private.abandon_challenge(uuid) to authenticated;
grant execute on function public.abandon_challenge(uuid) to authenticated;
