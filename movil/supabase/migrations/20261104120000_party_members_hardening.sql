-- P0-1 / P1-2 / P2-5 (docs/AUDITORIA-PRODUCCION.md): nadie entra en un convoy,
-- cambia su rol o vuelve tras ser expulsado sin pasar por las funciones del
-- servidor.
--
-- Antes: party_members_insert solo pedía user_id = auth.uid() (cualquiera se
-- metía en cualquier convoy, saltando código, invitación y límite) y
-- party_members_update dejaba cambiar cualquier columna de tu fila (rol,
-- party_id, left_at).

-- 1. Alta directa solo para el anfitrión en su propio convoy recién creado (la
--    app lo hace así al crear). Unirse = join_party / accept_party_invite.
drop policy if exists party_members_insert on public.party_members;
create policy party_members_insert on public.party_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'host'
    and exists (select 1 from public.parties p where p.id = party_id and p.host_id = (select auth.uid()))
  );

-- 2. Cada uno actualiza solo su fila, y solo las columnas de posición,
--    progreso, canal de voz, silencio y salida. Rol, convoy y expulsión van
--    por funciones del servidor (security definer).
drop policy if exists party_members_update on public.party_members;
create policy party_members_update on public.party_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.party_members from anon, authenticated;
grant update (
  last_lat, last_lng, last_location, last_speed_kmh, last_heading, last_seen_at,
  eta_s, remaining_m, progress_at, arrived_at, voice_channel_slug, is_muted, left_at
) on public.party_members to authenticated;

-- 3. Expulsión que dura: marca kicked_at; con ella no se vuelve con el código.
alter table public.party_members add column if not exists kicked_at timestamptz;

-- 4. Salir es definitivo desde la app: left_at no vuelve a null salvo por las
--    funciones del servidor (al volver a entrar con código o invitación).
create or replace function private.party_members_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Dentro de una función security definer current_user es su dueño.
  if current_user in ('authenticated', 'anon') then
    if old.left_at is not null and new.left_at is null then
      raise exception 'rejoin_requires_server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists party_members_guard on public.party_members;
create trigger party_members_guard
  before update on public.party_members
  for each row execute function private.party_members_guard();

-- 5. Expulsar marca kicked_at.
create or replace function private.kick_party_member(p_party_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.parties where id = p_party_id and host_id = auth.uid()) then
    raise exception 'not_host';
  end if;
  if p_user_id = auth.uid() then raise exception 'cannot_kick_self'; end if;
  update public.party_members
     set left_at = now(), kicked_at = now(), last_lat = null, last_lng = null
   where party_id = p_party_id and user_id = p_user_id and left_at is null;
end;
$$;

-- 6. Unirse con código: convoy bloqueado mientras se cuenta (dos entradas a la
--    vez no pasan del límite) y sin vuelta para expulsados.
create or replace function private.join_party(p_code text)
returns public.parties language plpgsql security definer set search_path = public as $$
declare v_party public.parties; v_count integer; v_member public.party_members;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_party from public.parties
  where invite_code = upper(trim(p_code)) and status in ('scheduled', 'live') and expires_at > now()
  limit 1
  for update;
  if v_party.id is null then raise exception 'party_not_found'; end if;

  select * into v_member from public.party_members where party_id = v_party.id and user_id = auth.uid();
  if v_member.kicked_at is not null then raise exception 'kicked'; end if;
  if v_member.user_id is not null and v_member.left_at is null then return v_party; end if;

  select count(*) into v_count from public.party_members where party_id = v_party.id and left_at is null;
  if v_count >= v_party.max_members then raise exception 'party_full'; end if;

  -- Solo una party activa a la vez.
  update public.party_members set left_at = now(), last_lat = null, last_lng = null
  where user_id = auth.uid() and left_at is null and party_id <> v_party.id;

  insert into public.party_members (party_id, user_id, role, last_seen_at)
  values (v_party.id, auth.uid(), 'member', now())
  on conflict (party_id, user_id) do update set left_at = null, last_seen_at = now();
  return v_party;
end;
$$;

-- 7. Aceptar una invitación: el anfitrión invitó a propósito, así que borra
--    una expulsión anterior; mismo bloqueo contra el límite.
create or replace function private.accept_party_invite(p_invite_id uuid)
returns public.parties language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_invite public.party_invites; v_party public.parties; v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_invite from public.party_invites
  where id = p_invite_id and invitee_id = v_uid and status = 'pending';
  if v_invite.id is null then raise exception 'invite_not_found'; end if;
  select * into v_party from public.parties
  where id = v_invite.party_id and status in ('scheduled', 'live') and expires_at > now()
  for update;
  if v_party.id is null then raise exception 'party_not_found'; end if;
  select count(*) into v_count from public.party_members
  where party_id = v_party.id and left_at is null and user_id <> v_uid;
  if v_count >= v_party.max_members then raise exception 'party_full'; end if;

  update public.party_members set left_at = now(), last_lat = null, last_lng = null
  where user_id = v_uid and left_at is null and party_id <> v_party.id;

  insert into public.party_members (party_id, user_id, role, last_seen_at)
  values (v_party.id, v_uid, 'member', now())
  on conflict (party_id, user_id) do update set left_at = null, kicked_at = null, last_seen_at = now();

  update public.party_invites set status = 'accepted', responded_at = now()
  where id = v_invite.id;
  return v_party;
end;
$$;
