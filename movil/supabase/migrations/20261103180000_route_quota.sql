-- MAPA-12: rutas con el tráfico de Google (Routes API), con tope de gasto.
-- Las rutas con tráfico tienen ~5.000 gratis al mes: 150 al día para toda la
-- app (~4.500 al mes) y 60 por usuario. Pasado el tope, la app usa Mapbox (con
-- tráfico) hasta el día siguiente: el gasto queda en US$0.

create table if not exists public.route_quota (
  day date not null default (now() at time zone 'utc')::date,
  user_id uuid not null,
  count integer not null default 0,
  primary key (day, user_id)
);

alter table public.route_quota enable row level security;
-- Sin políticas: solo se escribe con la función de abajo.

create or replace function private.bump_route_quota(p_limit integer, p_global_limit integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_global constant uuid := '00000000-0000-0000-0000-000000000000';
  v_count integer;
  v_total integer;
begin
  if v_uid is null then return false; end if;
  insert into public.route_quota (day, user_id, count) values (v_day, v_global, 1)
  on conflict (day, user_id) do update set count = public.route_quota.count + 1
  returning count into v_total;
  if v_total > greatest(1, p_global_limit) then return false; end if;
  insert into public.route_quota (day, user_id, count) values (v_day, v_uid, 1)
  on conflict (day, user_id) do update set count = public.route_quota.count + 1
  returning count into v_count;
  delete from public.route_quota where day < v_day - 40;
  return v_count <= greatest(1, p_limit);
end;
$$;

create or replace function public.bump_route_quota(p_limit integer, p_global_limit integer)
returns boolean
language sql security invoker set search_path = public, private as $$
  select private.bump_route_quota(p_limit, p_global_limit);
$$;

revoke all on function private.bump_route_quota(integer, integer) from public, anon;
revoke all on function public.bump_route_quota(integer, integer) from public, anon;
grant execute on function private.bump_route_quota(integer, integer) to authenticated;
grant execute on function public.bump_route_quota(integer, integer) to authenticated;
