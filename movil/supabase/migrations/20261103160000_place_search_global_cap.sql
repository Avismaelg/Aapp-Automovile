-- MAPA-02: tope de gasto de Google (US$1). La alerta de presupuesto de Google
-- solo avisa, no corta. Aquí se corta de verdad: además del tope por usuario,
-- un tope diario para toda la app. 300 consultas al día son ~9.000 al mes,
-- por debajo de las ~10.000 gratuitas de Places (autocompletar y detalle), así
-- que el gasto queda en US$0 y nunca llega al dólar. Pasado el tope, la app
-- vuelve sola al buscador gratuito hasta el día siguiente.

create table if not exists public.place_search_global (
  day date primary key default (now() at time zone 'utc')::date,
  count integer not null default 0
);

alter table public.place_search_global enable row level security;
-- Sin políticas: solo se escribe con la función de abajo.

create or replace function private.bump_place_search(p_limit integer, p_global_limit integer default 300)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_global integer;
  v_day date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then return false; end if;

  insert into public.place_search_global (day, count) values (v_day, 1)
  on conflict (day) do update set count = public.place_search_global.count + 1
  returning count into v_global;
  if v_global > greatest(1, p_global_limit) then return false; end if;

  insert into public.place_search_usage (user_id, day, count)
  values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set count = public.place_search_usage.count + 1
  returning count into v_count;
  delete from public.place_search_usage where user_id = v_uid and day < v_day - 7;
  delete from public.place_search_global where day < v_day - 40;
  return v_count <= greatest(1, p_limit);
end;
$$;

create or replace function public.bump_place_search(p_limit integer, p_global_limit integer default 300)
returns boolean
language sql security invoker set search_path = public, private as $$
  select private.bump_place_search(p_limit, p_global_limit);
$$;

-- La versión anterior (un solo parámetro) queda sustituida.
drop function if exists public.bump_place_search(integer);
drop function if exists private.bump_place_search(integer);

revoke all on function private.bump_place_search(integer, integer) from public, anon;
revoke all on function public.bump_place_search(integer, integer) from public, anon;
grant execute on function private.bump_place_search(integer, integer) to authenticated;
grant execute on function public.bump_place_search(integer, integer) to authenticated;
