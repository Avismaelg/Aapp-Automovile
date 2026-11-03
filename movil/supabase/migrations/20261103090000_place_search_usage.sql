-- MAPA-02: tope diario de búsquedas de lugares (Google Places) por usuario,
-- para que la cuota gratuita no se agote por un abuso y no haya cobros por
-- sorpresa. Lo usa la Edge Function «places».

create table if not exists public.place_search_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.place_search_usage enable row level security;
-- Sin políticas: solo se escribe con la función de abajo.

create or replace function private.bump_place_search(p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then return false; end if;
  insert into public.place_search_usage (user_id, day, count)
  values (v_uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = public.place_search_usage.count + 1
  returning count into v_count;
  -- Limpieza ligera: días viejos fuera.
  delete from public.place_search_usage
  where user_id = v_uid and day < (now() at time zone 'utc')::date - 7;
  return v_count <= greatest(1, p_limit);
end;
$$;

create or replace function public.bump_place_search(p_limit integer) returns boolean
language sql security invoker set search_path = public, private as $$
  select private.bump_place_search(p_limit);
$$;

revoke all on function private.bump_place_search(integer) from public, anon;
revoke all on function public.bump_place_search(integer) from public, anon;
grant execute on function private.bump_place_search(integer) to authenticated;
grant execute on function public.bump_place_search(integer) to authenticated;
