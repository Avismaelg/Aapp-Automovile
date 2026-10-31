-- Invitar a la party con un toque y ver a los amigos en el mapa.
--
-- 1. party_invites: un miembro invita a un amigo; el amigo lo acepta con un
--    toque (sin códigos). Solo se puede invitar a amigos aceptados y no
--    bloqueados, para que nadie reciba invitaciones de desconocidos.
-- 2. friend_locations: última posición que cada usuario decide compartir con
--    sus amigos. Antes la única posición visible era la de party_members, que
--    la RLS solo deja leer a los miembros de la misma party: un amigo fuera de
--    tu party nunca aparecía en tu mapa.
-- 3. Las parties nuevas admiten hasta 50 pilotos (el límite de la tabla).

-- ----------------------------------------------------------------------------
-- Ubicación compartida con amigos
-- ----------------------------------------------------------------------------
create table if not exists public.friend_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  heading real,
  speed_kmh real,
  updated_at timestamptz not null default now()
);

create index if not exists friend_locations_updated_idx
  on public.friend_locations (updated_at desc);

alter table public.friend_locations enable row level security;

drop policy if exists friend_locations_select on public.friend_locations;
create policy friend_locations_select on public.friend_locations
  for select using (
    user_id = (select auth.uid())
    or (
      private.are_friends((select auth.uid()), user_id)
      and not private.is_blocked((select auth.uid()), user_id)
    )
  );

drop policy if exists friend_locations_insert on public.friend_locations;
create policy friend_locations_insert on public.friend_locations
  for insert with check (user_id = (select auth.uid()));

drop policy if exists friend_locations_update on public.friend_locations;
create policy friend_locations_update on public.friend_locations
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Dejar de compartir borra la fila.
drop policy if exists friend_locations_delete on public.friend_locations;
create policy friend_locations_delete on public.friend_locations
  for delete using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Invitaciones a la party
-- ----------------------------------------------------------------------------
create table if not exists public.party_invites (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  -- Copia del nombre y destino: el invitado aún no puede leer la party.
  party_name text not null,
  destination_label text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint party_invites_no_self check (inviter_id <> invitee_id),
  unique (party_id, invitee_id)
);

create index if not exists party_invites_invitee_idx
  on public.party_invites (invitee_id, status, created_at desc);

alter table public.party_invites enable row level security;

-- Las ve quien invita y quien es invitado. Crear y aceptar pasa por las
-- funciones de abajo; el invitado solo puede rechazar directamente.
drop policy if exists party_invites_select on public.party_invites;
create policy party_invites_select on public.party_invites
  for select using ((select auth.uid()) in (inviter_id, invitee_id));

drop policy if exists party_invites_update on public.party_invites;
create policy party_invites_update on public.party_invites
  for update using (invitee_id = (select auth.uid()))
  with check (invitee_id = (select auth.uid()) and status = 'declined');

create or replace function private.invite_to_party(p_party_id uuid, p_user_id uuid)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_party public.parties;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.party_members
    where party_id = p_party_id and user_id = v_uid and left_at is null
  ) then raise exception 'not_a_member'; end if;
  select * into v_party from public.parties
  where id = p_party_id and status in ('scheduled', 'live') and expires_at > now();
  if v_party.id is null then raise exception 'party_not_found'; end if;
  if not private.are_friends(v_uid, p_user_id) or private.is_blocked(v_uid, p_user_id) then
    raise exception 'not_friends';
  end if;
  if exists (
    select 1 from public.party_members
    where party_id = p_party_id and user_id = p_user_id and left_at is null
  ) then raise exception 'already_member'; end if;

  -- Reinvitar a quien rechazó vuelve a dejarla pendiente.
  insert into public.party_invites (party_id, inviter_id, invitee_id, party_name, destination_label)
  values (p_party_id, v_uid, p_user_id, v_party.name, v_party.destination_label)
  on conflict (party_id, invitee_id) do update
    set inviter_id = excluded.inviter_id, status = 'pending',
        party_name = excluded.party_name, destination_label = excluded.destination_label,
        created_at = now(), responded_at = null
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.accept_party_invite(p_invite_id uuid)
returns public.parties language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_invite public.party_invites; v_party public.parties; v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_invite from public.party_invites
  where id = p_invite_id and invitee_id = v_uid and status = 'pending';
  if v_invite.id is null then raise exception 'invite_not_found'; end if;
  select * into v_party from public.parties
  where id = v_invite.party_id and status in ('scheduled', 'live') and expires_at > now();
  if v_party.id is null then raise exception 'party_not_found'; end if;
  select count(*) into v_count from public.party_members
  where party_id = v_party.id and left_at is null;
  if v_count >= v_party.max_members then raise exception 'party_full'; end if;

  -- Solo una party activa a la vez: entrar en esta te saca de las demás.
  update public.party_members set left_at = now(), last_lat = null, last_lng = null
  where user_id = v_uid and left_at is null and party_id <> v_party.id;

  insert into public.party_members (party_id, user_id, role, last_seen_at)
  values (v_party.id, v_uid, 'member', now())
  on conflict (party_id, user_id) do update set left_at = null, last_seen_at = now();

  update public.party_invites set status = 'accepted', responded_at = now()
  where id = v_invite.id;
  return v_party;
end;
$$;

create or replace function public.invite_to_party(p_party_id uuid, p_user_id uuid)
returns uuid language sql security invoker set search_path = public, private as $$
  select private.invite_to_party(p_party_id, p_user_id);
$$;

create or replace function public.accept_party_invite(p_invite_id uuid)
returns public.parties language sql security invoker set search_path = public, private as $$
  select private.accept_party_invite(p_invite_id);
$$;

revoke all on function private.invite_to_party(uuid, uuid) from public, anon;
revoke all on function private.accept_party_invite(uuid) from public, anon;
revoke all on function public.invite_to_party(uuid, uuid) from public, anon;
revoke all on function public.accept_party_invite(uuid) from public, anon;
grant execute on function private.invite_to_party(uuid, uuid) to authenticated;
grant execute on function private.accept_party_invite(uuid) to authenticated;
grant execute on function public.invite_to_party(uuid, uuid) to authenticated;
grant execute on function public.accept_party_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Parties más grandes y tiempo real de invitaciones
-- ----------------------------------------------------------------------------
alter table public.parties alter column max_members set default 50;
update public.parties set max_members = 50
where status in ('scheduled', 'live') and max_members < 50;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.party_invites;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
