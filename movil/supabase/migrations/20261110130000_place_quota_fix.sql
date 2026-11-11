-- Auditoría final B5: un solo usuario no puede agotar el cupo global de Places.
--
-- Antes el cupo por usuario y el global valían 300: quien llamara 300 veces al
-- RPC (incluso sin pasar por la Edge Function) dejaba a toda la app sin
-- buscador el resto del día. Ahora cada usuario tiene 60 y el global sigue en
-- 300, que es el tope de gasto de Google. Los parámetros p_limit y
-- p_global_limit se conservan para no romper a quien llama, pero se ignoran.

create or replace function private.bump_place_search(p_limit integer, p_global_limit integer default 300)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_user_cap constant integer := 60;
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

create or replace function public.bump_place_search(p_limit integer, p_global_limit integer default 300)
returns boolean language sql security invoker set search_path = public, private as $$
  select private.bump_place_search(p_limit, p_global_limit);
$$;

revoke all on function private.bump_place_search(integer, integer) from public, anon;
revoke all on function public.bump_place_search(integer, integer) from public, anon;
grant execute on function private.bump_place_search(integer, integer) to authenticated;
grant execute on function public.bump_place_search(integer, integer) to authenticated;
