-- REG-01…REG-07: registro en 3 pasos con vehículo obligatorio.
--
-- 1. El perfil guarda nombre y apellido (el apodo es el @usuario).
-- 2. Apodo: 3–20 caracteres con letras, números, «_» y «.» (los usuarios
--    antiguos de hasta 24 siguen valiendo: el CHECK admite 24).
-- 3. La app comprueba en vivo si el apodo está libre y si el correo ya tiene
--    cuenta, antes de enviar.
-- 4. El vehículo llega en los metadatos del alta y el trigger crea, en la
--    misma transacción que el usuario, el perfil y el vehículo principal:
--    o se crea todo o nada (sin perfiles ni vehículos huérfanos). Funciona
--    también con confirmación de correo, cuando aún no hay sesión.

alter table public.profiles
  add column if not exists first_name text check (char_length(first_name) <= 40),
  add column if not exists last_name text check (char_length(last_name) <= 40);

alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles
  add constraint profiles_username_check
  check (username ~ '^[a-z0-9_.]{3,24}$' and username !~ '^\.|\.$|\.\.');

-- Unicidad sin distinguir mayúsculas (los apodos ya se guardan en minúscula).
create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));

create or replace function private.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select lower(coalesce(p_username, '')) ~ '^[a-z0-9_.]{3,20}$'
    and lower(p_username) !~ '^\.|\.$|\.\.'
    and not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security invoker set search_path = public, private as $$
  select private.username_available(p_username);
$$;

-- Solo responde sí/no para un correo concreto (no lista nada).
create or replace function private.email_registered(p_email text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))));
$$;

create or replace function public.email_registered(p_email text) returns boolean
language sql stable security invoker set search_path = public, private as $$
  select private.email_registered(p_email);
$$;

revoke all on function private.username_available(text) from public;
revoke all on function private.email_registered(text) from public;
grant execute on function private.username_available(text) to anon, authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function private.email_registered(text) to anon, authenticated;
grant execute on function public.email_registered(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  desired_username text;
  v jsonb := meta->'vehicle';
  v_kind text;
  v_year integer;
  v_max_year integer := extract(year from now())::integer + 1;
begin
  desired_username := lower(coalesce(meta->>'username', ''));
  if desired_username !~ '^[a-z0-9_.]{3,24}$'
     or desired_username ~ '^\.|\.$|\.\.'
     or exists (select 1 from public.profiles where lower(username) = desired_username) then
    desired_username := public.generate_username();
  end if;

  insert into public.profiles (id, username, display_name, first_name, last_name, avatar_url)
  values (
    new.id,
    desired_username,
    left(coalesce(
      nullif(trim(coalesce(meta->>'first_name', '') || ' ' || coalesce(meta->>'last_name', '')), ''),
      meta->>'display_name',
      split_part(coalesce(new.email, 'driver'), '@', 1)
    ), 60),
    nullif(left(trim(coalesce(meta->>'first_name', '')), 40), ''),
    nullif(left(trim(coalesce(meta->>'last_name', '')), 40), ''),
    meta->>'avatar_url'
  )
  on conflict (id) do nothing;

  -- Vehículo del paso 3 (si viene y es válido). Un dato malo no rompe el alta:
  -- se omite el vehículo y la app pide añadirlo.
  if v is not null and jsonb_typeof(v) = 'object'
     and char_length(trim(coalesce(v->>'make', ''))) between 1 and 40
     and char_length(trim(coalesce(v->>'model', ''))) between 1 and 60 then
    v_kind := coalesce(v->>'kind', 'car');
    if v_kind not in ('car', 'motorcycle', 'ev', 'truck') then v_kind := 'car'; end if;
    begin
      v_year := (v->>'year')::integer;
    exception when others then
      v_year := null;
    end;
    if v_year is not null and (v_year < 1950 or v_year > v_max_year) then v_year := null; end if;
    insert into public.vehicles (owner_id, make, model, year, color, plate, kind, fuel_kind, is_primary)
    values (
      new.id,
      trim(v->>'make'),
      trim(v->>'model'),
      v_year,
      nullif(left(trim(coalesce(v->>'color', '')), 20), ''),
      nullif(upper(left(trim(coalesce(v->>'plate', '')), 12)), ''),
      v_kind::public.vehicle_kind,
      case when v_kind = 'ev' then 'electric' else 'gasoline' end,
      true
    );
  end if;
  return new;
end;
$$;
