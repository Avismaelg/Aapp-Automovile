-- Auditoría final (2026-11-10): bloqueos que no bloqueaban, quedadas en clubs
-- ajenos, destino del convoy sin validar y voz del convoy al borrar la cuenta.

-- B2 · Bloqueos. Antes un bloqueo solo ocultaba el perfil: quien estaba
-- bloqueado seguía viendo las publicaciones, rutas y vehículos públicos del
-- otro, y si eran amigos también lo «solo amigos». Ahora un bloqueo (en
-- cualquier sentido) corta la amistad a efectos de permisos y oculta todo eso.
create or replace function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not private.is_blocked(a, b) and exists(
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create or replace function private.can_view_drive(viewer uuid, drive_id uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists(
    select 1 from public.drives d
    where d.id = drive_id
      and (
        d.user_id = viewer
        or (
          not private.is_blocked(viewer, d.user_id)
          and (d.visibility = 'public' or (d.visibility = 'friends' and private.are_friends(viewer, d.user_id)))
        )
      )
  );
$$;

create or replace function private.can_view_post(viewer uuid, p_post_id uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists(
    select 1 from public.posts p
    where p.id = p_post_id
      and (
        p.user_id = viewer
        or (
          not private.is_blocked(viewer, p.user_id)
          and (p.visibility = 'public' or (p.visibility = 'friends' and private.are_friends(viewer, p.user_id)))
        )
      )
  );
$$;

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select using (
    user_id = (select auth.uid())
    or (
      not private.is_blocked((select auth.uid()), user_id)
      and (
        visibility = 'public'::public.privacy_level
        or (visibility = 'friends'::public.privacy_level and private.are_friends((select auth.uid()), user_id))
      )
    )
  );

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select using (
    owner_id = (select auth.uid())
    or (
      not private.is_blocked((select auth.uid()), owner_id)
      and (
        privacy = 'public'::public.privacy_level
        or (privacy = 'friends'::public.privacy_level and private.are_friends((select auth.uid()), owner_id))
      )
    )
  );

-- B2 · Quedadas. Cualquiera podía crear una quedada «de» un club ajeno (salía
-- a sus miembros como si fuera del club) y apuntarse a una privada sabiendo
-- su id.
drop policy if exists meets_insert on public.meets;
create policy meets_insert on public.meets
  for insert with check (
    host_id = (select auth.uid())
    and (
      club_id is null
      or private.is_club_member(club_id)
      or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = (select auth.uid()))
    )
  );

drop policy if exists meets_update on public.meets;
create policy meets_update on public.meets
  for update using (host_id = (select auth.uid()))
  with check (
    host_id = (select auth.uid())
    and (
      club_id is null
      or private.is_club_member(club_id)
      or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = (select auth.uid()))
    )
  );

drop policy if exists meet_attendees_insert on public.meet_attendees;
create policy meet_attendees_insert on public.meet_attendees
  for insert with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.meets m
      where m.id = meet_attendees.meet_id
        and (
          m.privacy = 'public'::public.privacy_level
          or m.host_id = (select auth.uid())
          or (m.club_id is not null and private.is_club_member(m.club_id))
        )
    )
  );

-- B4 · Destino del convoy: coordenadas fuera de rango (o NaN/Infinity, que en
-- Postgres son mayores que cualquier número) rompían el mapa de todo el
-- convoy. Quitar el destino (null) sigue valiendo.
create or replace function private.set_party_destination(p_party_id uuid, p_label text, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_host uuid; v_role public.party_role;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if abs(p_lat) > 90 or abs(p_lng) > 180 then raise exception 'invalid_position'; end if;
  select host_id into v_host from public.parties where id = p_party_id;
  if v_host is null then raise exception 'party_not_found'; end if;
  select role into v_role from public.party_members
   where party_id = p_party_id and user_id = v_uid and left_at is null;
  if v_host <> v_uid and v_role is null then raise exception 'not_a_member'; end if;
  if v_host <> v_uid and v_role <> 'sweeper' then raise exception 'not_allowed'; end if;
  update public.parties
     set destination_label = nullif(trim(coalesce(p_label, '')), ''),
         destination_lat = p_lat,
         destination_lng = p_lng,
         destination_set_by = v_uid,
         destination_set_at = now()
   where id = p_party_id;
  update public.party_members
     set arrived_at = null, eta_s = null, remaining_m = null
   where party_id = p_party_id;
end;
$$;
revoke all on function private.set_party_destination(uuid, text, double precision, double precision) from public, anon;
grant execute on function private.set_party_destination(uuid, text, double precision, double precision) to authenticated;

-- B6 · Voz del convoy: al BORRARSE la fila del miembro (cuenta borrada) no se
-- le echaba de la sala; seguía oyendo hasta caducar el token. Si lo que se
-- borra es el convoy entero, la sala ya no existe y no hay nada que hacer.
create or replace function private.voice_revoke()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_room text;
  v_party uuid;
  v_user uuid;
begin
  if tg_op = 'DELETE' then
    if old.left_at is not null then return null; end if;
    v_party := old.party_id;
    v_user := old.user_id;
  else
    if old.left_at is not null or new.left_at is null then return null; end if;
    v_party := new.party_id;
    v_user := new.user_id;
  end if;
  select value into v_url from private.push_config where key = 'url';
  select value into v_secret from private.push_config where key = 'secret';
  if v_url is null or v_secret is null then return null; end if;
  select voice_room into v_room from public.parties where id = v_party;
  if v_room is null then return null; end if;
  perform net.http_post(
    url := regexp_replace(v_url, '/push$', '/livekit-revoke'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('party_id', v_party, 'user_id', v_user, 'voice_room', v_room),
    timeout_milliseconds := 5000
  );
  return null;
exception when others then
  -- Echar de la sala nunca debe impedir salir del convoy ni borrar la cuenta.
  return null;
end;
$$;
revoke all on function private.voice_revoke() from public, anon, authenticated;

drop trigger if exists party_members_voice_revoke on public.party_members;
create trigger party_members_voice_revoke
  after update of left_at or delete on public.party_members
  for each row execute function private.voice_revoke();
