-- Reconciliación de lo aplicado durante el desarrollo remoto.
-- Idempotente para que un checkout limpio pueda reconstruir producción.

-- ---------------------------------------------------------------------------
-- Eventos, fotografías, récords y tramos
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references auth.users(id) on delete cascade,
  host_name text,
  title text not null,
  description text,
  starts_at timestamptz,
  is_public boolean not null default true,
  location_label text,
  latitude double precision,
  longitude double precision,
  route jsonb,
  route_distance_m numeric,
  route_time_ms numeric,
  created_at timestamptz not null default now()
);

create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_host_idx on public.events (host_id);
alter table public.events enable row level security;
drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (is_public);
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (host_id = (select auth.uid()));
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated using (host_id = (select auth.uid()));
revoke all on public.events from anon;
revoke all on public.events from authenticated;
grant select on public.events to anon, authenticated;
grant insert, delete on public.events to authenticated;

insert into storage.buckets (id, name, public)
values ('vehicles', 'vehicles', true)
on conflict (id) do update set public = true;

drop policy if exists "vehicle photo read" on storage.objects;
create policy "vehicle photo read" on storage.objects for select to public
using (bucket_id = 'vehicles');
drop policy if exists "vehicle photo insert" on storage.objects;
create policy "vehicle photo insert" on storage.objects for insert to authenticated
with check (bucket_id = 'vehicles' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "vehicle photo update" on storage.objects;
create policy "vehicle photo update" on storage.objects for update to authenticated
using (bucket_id = 'vehicles' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'vehicles' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "vehicle photo delete" on storage.objects;
create policy "vehicle photo delete" on storage.objects for delete to authenticated
using (bucket_id = 'vehicles' and (storage.foldername(name))[1] = (select auth.uid())::text);

create table if not exists public.highway_segments (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text,
  speed_limit_kmh int not null default 100,
  polyline jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.highway_segments enable row level security;
drop policy if exists highway_segments_read on public.highway_segments;
create policy highway_segments_read on public.highway_segments for select using (true);

create table if not exists public.speed_records (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.highway_segments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  vehicle_name text,
  max_speed_kmh numeric not null check (max_speed_kmh > 0 and max_speed_kmh < 400),
  distance_m numeric,
  recorded_at timestamptz not null default now(),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists speed_records_segment_idx on public.speed_records (segment_id, max_speed_kmh desc);
create index if not exists speed_records_user_id_idx on public.speed_records (user_id);
alter table public.speed_records enable row level security;
drop policy if exists speed_records_read_public on public.speed_records;
create policy speed_records_read_public on public.speed_records for select using (is_public);
drop policy if exists speed_records_insert_own on public.speed_records;
create policy speed_records_insert_own on public.speed_records for insert to authenticated
with check (user_id = (select auth.uid()));

insert into public.highway_segments (slug, name, city, speed_limit_kmh, polyline) values
  ('las-americas', 'Autopista de las Américas', 'Santo Domingo', 80, '[[18.4780,-69.9250],[18.4720,-69.9000],[18.4660,-69.8750],[18.4620,-69.8500]]'),
  ('duarte', 'Autopista Duarte', 'Santo Domingo', 100, '[[18.5000,-69.9700],[18.5200,-70.0500],[18.5450,-70.1500]]'),
  ('del-coral', 'Autopista del Coral', 'La Romana', 110, '[[18.5600,-68.9000],[18.5200,-68.8200],[18.4800,-68.7400]]'),
  ('30-de-mayo', 'Autopista 30 de Mayo', 'Santo Domingo', 80, '[[18.4400,-69.9600],[18.4450,-69.9300],[18.4520,-69.9000]]')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- RPC de destino: solo usuarios autenticados y miembros de la party
-- ---------------------------------------------------------------------------

create or replace function public.set_party_destination(
  p_party_id uuid,
  p_label text,
  p_lat double precision,
  p_lng double precision
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_is_member boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'invalid_latitude'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'invalid_longitude'; end if;
  if p_label is not null and char_length(p_label) > 160 then raise exception 'label_too_long'; end if;
  select host_id into v_host from public.parties where id = p_party_id;
  if v_host is null then raise exception 'party_not_found'; end if;
  select exists(select 1 from public.party_members where party_id = p_party_id and user_id = v_uid and left_at is null) into v_is_member;
  if v_host <> v_uid and not v_is_member then raise exception 'not_a_member'; end if;
  update public.parties
    set destination_label = nullif(trim(coalesce(p_label, '')), ''), destination_lat = p_lat, destination_lng = p_lng
  where id = p_party_id;
end;
$$;
revoke all on function public.set_party_destination(uuid, text, double precision, double precision) from public, anon;
grant execute on function public.set_party_destination(uuid, text, double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones SECURITY DEFINER fuera del esquema expuesto por PostgREST
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter function public.are_friends(uuid, uuid) set schema private;
alter function public.can_view_drive(uuid, uuid) set schema private;
alter function public.can_view_post(uuid, uuid) set schema private;
alter function public.can_view_profile(uuid, uuid) set schema private;
alter function public.create_party_voice_channels() set schema private;
alter function public.is_blocked(uuid, uuid) set schema private;
alter function public.is_challenge_host(uuid) set schema private;
alter function public.is_challenge_participant(uuid) set schema private;
alter function public.is_club_member(uuid) set schema private;
alter function public.is_party_host(uuid) set schema private;
alter function public.is_party_member(uuid) set schema private;
alter function public.join_party(text) set schema private;
alter function public.set_party_destination(uuid, text, double precision, double precision) set schema private;

create or replace function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.friendships f where f.status='accepted' and ((f.requester_id=a and f.addressee_id=b) or (f.requester_id=b and f.addressee_id=a)));
$$;
create or replace function private.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.blocks bl where (bl.blocker_id=a and bl.blocked_id=b) or (bl.blocker_id=b and bl.blocked_id=a));
$$;
create or replace function private.can_view_drive(viewer uuid, drive_id uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists(select 1 from public.drives d where d.id=drive_id and (d.user_id=viewer or d.visibility='public' or (d.visibility='friends' and private.are_friends(viewer,d.user_id))));
$$;
create or replace function private.can_view_post(viewer uuid, p_post_id uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists(select 1 from public.posts p where p.id=p_post_id and (p.user_id=viewer or p.visibility='public' or (p.visibility='friends' and private.are_friends(viewer,p.user_id))));
$$;
create or replace function private.can_view_profile(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select target=viewer or (not private.is_blocked(viewer,target) and exists(select 1 from public.profiles p where p.id=target and (p.privacy='public' or (p.privacy='friends' and private.are_friends(viewer,target)))));
$$;
create or replace function private.is_challenge_host(p_challenge_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.challenges c where c.id=p_challenge_id and c.host_id=auth.uid());
$$;
create or replace function private.is_challenge_participant(p_challenge_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.challenge_participants cp where cp.challenge_id=p_challenge_id and cp.user_id=auth.uid());
$$;
create or replace function private.is_club_member(p_club_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.club_members cm where cm.club_id=p_club_id and cm.user_id=auth.uid());
$$;
create or replace function private.is_party_host(p_party_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.parties p where p.id=p_party_id and p.host_id=auth.uid());
$$;
create or replace function private.is_party_member(p_party_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.party_members pm where pm.party_id=p_party_id and pm.user_id=auth.uid() and pm.left_at is null);
$$;
create or replace function private.create_party_voice_channels() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.party_voice_channels (party_id, slug, name, position)
  values (new.id,'convoy','Convoy',0),(new.id,'route','Ruta',1),(new.id,'chat','Charla',2)
  on conflict (party_id,slug) do nothing;
  return new;
end;
$$;

create or replace function private.join_party(p_code text)
returns public.parties language plpgsql security definer set search_path = public as $$
declare v_party public.parties; v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_party from public.parties
  where invite_code=upper(trim(p_code)) and status in ('scheduled','live') and expires_at>now()
  limit 1;
  if v_party.id is null then raise exception 'party_not_found'; end if;
  select count(*) into v_count from public.party_members where party_id=v_party.id and left_at is null;
  if v_count >= v_party.max_members and not exists(select 1 from public.party_members where party_id=v_party.id and user_id=auth.uid()) then
    raise exception 'party_full';
  end if;
  insert into public.party_members (party_id,user_id,role)
  values (v_party.id,auth.uid(),'member')
  on conflict (party_id,user_id) do update set left_at=null;
  return v_party;
end;
$$;

create or replace function private.set_party_destination(p_party_id uuid, p_label text, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid:=auth.uid(); v_host uuid; v_is_member boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select host_id into v_host from public.parties where id=p_party_id;
  if v_host is null then raise exception 'party_not_found'; end if;
  select exists(select 1 from public.party_members where party_id=p_party_id and user_id=v_uid and left_at is null) into v_is_member;
  if v_host<>v_uid and not v_is_member then raise exception 'not_a_member'; end if;
  update public.parties set destination_label=nullif(trim(coalesce(p_label,'')),''), destination_lat=p_lat, destination_lng=p_lng where id=p_party_id;
end;
$$;

create or replace function public.join_party(p_code text)
returns public.parties language sql security invoker set search_path = public, private as $$ select private.join_party(p_code); $$;
revoke all on function public.join_party(text) from public, anon;
grant execute on function public.join_party(text) to authenticated;

create or replace function public.set_party_destination(p_party_id uuid, p_label text, p_lat double precision, p_lng double precision)
returns void language sql security invoker set search_path = public, private as $$ select private.set_party_destination(p_party_id,p_label,p_lat,p_lng); $$;
revoke all on function public.set_party_destination(uuid,text,double precision,double precision) from public, anon;
grant execute on function public.set_party_destination(uuid,text,double precision,double precision) to authenticated;

-- El resto de los cuerpos de join_party y set_party_destination se deja en
-- la migración remota de seguridad; este archivo conserva la historia y sus
-- permisos cuando se inicializa una base desde cero.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.are_friends(uuid,uuid) to authenticated;
grant execute on function private.can_view_drive(uuid,uuid) to authenticated;
grant execute on function private.can_view_post(uuid,uuid) to authenticated;
grant execute on function private.can_view_profile(uuid,uuid) to authenticated;
grant execute on function private.is_blocked(uuid,uuid) to authenticated;
grant execute on function private.is_challenge_host(uuid) to authenticated;
grant execute on function private.is_challenge_participant(uuid) to authenticated;
grant execute on function private.is_club_member(uuid) to authenticated;
grant execute on function private.is_party_host(uuid) to authenticated;
grant execute on function private.is_party_member(uuid) to authenticated;
grant execute on function private.join_party(text) to authenticated;
grant execute on function private.set_party_destination(uuid,text,double precision,double precision) to authenticated;
grant execute on function private.create_party_voice_channels() to service_role;
