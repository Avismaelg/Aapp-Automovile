-- ============================================================================
-- CARAVANA — Esquema inicial de Supabase (PostgreSQL 15+)
-- ============================================================================
-- Ejecutar en el SQL Editor de Supabase o como migración:
--   supabase migration new init_caravana
--   (pegar este contenido)
--   supabase db push
--
-- Incluye: perfiles, garaje, amigos, trayectos, parties/convoy, chat,
-- combustible, feed, clubs, quedadas, notificaciones, moderación y QR.
-- RLS activado en todas las tablas de usuario.
-- ============================================================================

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.privacy_level as enum ('public', 'friends', 'private');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.friendship_status as enum ('pending', 'accepted', 'declined', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.drive_status as enum ('active', 'completed', 'discarded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.party_status as enum ('scheduled', 'live', 'ended', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.party_role as enum ('host', 'member', 'sweeper');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_kind as enum ('car', 'motorcycle', 'ev', 'truck');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.challenge_category as enum ('car', 'motorcycle', 'ev', 'truck', 'mixed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.challenge_status as enum ('pending', 'accepted', 'live', 'finished', 'declined', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.post_kind as enum ('drive', 'photo', 'party', 'achievement', 'text');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_type as enum ('image', 'video');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.meet_rsvp as enum ('going', 'interested', 'declined');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Utilidades
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_username()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  i integer := 0;
begin
  base := lower(regexp_replace(coalesce(current_setting('request.jwt.claims', true)::jsonb->>'email', 'driver'), '[^a-z0-9_]', '', 'g'));
  base := split_part(base, '@', 1);
  if length(base) < 3 then
    base := 'driver';
  end if;
  base := left(base, 15);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    i := i + 1;
    candidate := left(base, 12) || i::text;
  end loop;
  return candidate;
end;
$$;

-- ----------------------------------------------------------------------------
-- Perfiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text check (char_length(bio) <= 280),
  avatar_url text,
  cover_url text,
  city text,
  country_code char(2),
  qr_slug text not null unique default encode(extensions.gen_random_bytes(5), 'hex'),
  privacy public.privacy_level not null default 'public',
  show_plate boolean not null default false,
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  currency_code char(3) not null default 'DOP',
  home_location extensions.geography(Point, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_trgm_idx on public.profiles using gin (username extensions.gin_trgm_ops);
create index if not exists profiles_city_idx on public.profiles (city);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Crear perfil automáticamente al registrarse.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
begin
  -- El username elegido en la app se usa si es válido y está libre.
  desired_username := lower(coalesce(new.raw_user_meta_data->>'username', ''));

  if desired_username !~ '^[a-z0-9_]{3,24}$'
     or exists (select 1 from public.profiles where username = desired_username) then
    desired_username := public.generate_username();
  end if;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    desired_username,
    left(coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'driver'), '@', 1)), 60),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Garaje
-- ----------------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  make text not null check (char_length(make) between 1 and 40),
  model text not null check (char_length(model) between 1 and 60),
  year integer check (year between 1900 and 2100),
  nickname text check (char_length(nickname) <= 40),
  color text,
  plate text,
  photo_url text,
  kind public.vehicle_kind not null default 'car',
  fuel_kind text not null default 'gasoline' check (fuel_kind in ('gasoline', 'diesel', 'electric')),
  efficiency numeric(6,2) check (efficiency > 0),
  efficiency_unit text check (efficiency_unit in ('km_l', 'kwh_100km')),
  battery_kwh numeric(6,2) check (battery_kwh > 0),
  odometer_km numeric(12,1) not null default 0 check (odometer_km >= 0),
  is_primary boolean not null default false,
  privacy public.privacy_level not null default 'public',
  qr_slug text not null unique default encode(extensions.gen_random_bytes(5), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Compatibilidad con instalaciones anteriores a la migración de vehículos.
alter table public.vehicles add column if not exists kind public.vehicle_kind not null default 'car';
alter table public.vehicles add column if not exists fuel_kind text not null default 'gasoline';
alter table public.vehicles add column if not exists efficiency numeric(6,2);
alter table public.vehicles add column if not exists efficiency_unit text;
alter table public.vehicles add column if not exists battery_kwh numeric(6,2);

create index if not exists vehicles_owner_idx on public.vehicles (owner_id);
create index if not exists vehicles_kind_idx on public.vehicles (kind);
create unique index if not exists vehicles_one_primary_idx
  on public.vehicles (owner_id) where is_primary;

drop trigger if exists vehicles_set_updated_at on public.vehicles;
create trigger vehicles_set_updated_at
before update on public.vehicles
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Amigos y bloqueos
-- ----------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id)
);

create unique index if not exists friendships_unique_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;

create or replace function public.can_view_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target = viewer
    or (
      not public.is_blocked(viewer, target)
      and exists (
        select 1 from public.profiles p
        where p.id = target
          and (
            p.privacy = 'public'
            or (p.privacy = 'friends' and public.are_friends(viewer, target))
          )
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- Trayectos
-- ----------------------------------------------------------------------------
create table if not exists public.drives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  status public.drive_status not null default 'completed',
  started_at timestamptz not null,
  ended_at timestamptz,
  distance_m integer not null default 0 check (distance_m >= 0),
  duration_s integer not null default 0 check (duration_s >= 0),
  avg_speed_kmh numeric(6,2) check (avg_speed_kmh >= 0),
  max_speed_kmh numeric(6,2) check (max_speed_kmh >= 0),
  route extensions.geography(LineString, 4326),
  route_polyline text,
  start_point extensions.geography(Point, 4326),
  end_point extensions.geography(Point, 4326),
  start_label text,
  end_label text,
  is_auto boolean not null default true,
  notes text check (char_length(notes) <= 500),
  visibility public.privacy_level not null default 'friends',
  created_at timestamptz not null default now()
);

create index if not exists drives_user_started_idx on public.drives (user_id, started_at desc);
create index if not exists drives_vehicle_idx on public.drives (vehicle_id);
create index if not exists drives_route_gist_idx on public.drives using gist (route);
create index if not exists drives_start_gist_idx on public.drives using gist (start_point);

create table if not exists public.drive_passengers (
  drive_id uuid not null references public.drives(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (drive_id, user_id)
);

create or replace function public.can_view_drive(viewer uuid, drive_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.drives d
    where d.id = drive_id
      and (
        d.user_id = viewer
        or d.visibility = 'public'
        or (d.visibility = 'friends' and public.are_friends(viewer, d.user_id))
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- Parties / convoy
-- ----------------------------------------------------------------------------
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 300),
  status public.party_status not null default 'scheduled',
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  voice_room text not null unique default 'party_' || replace(gen_random_uuid()::text, '-', ''),
  destination extensions.geography(Point, 4326),
  destination_label text,
  route extensions.geography(LineString, 4326),
  starts_at timestamptz,
  ends_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  max_members integer not null default 10 check (max_members between 2 and 50),
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parties_host_idx on public.parties (host_id);
create index if not exists parties_status_idx on public.parties (status, starts_at desc);
create index if not exists parties_invite_idx on public.parties (invite_code);

drop trigger if exists parties_set_updated_at on public.parties;
create trigger parties_set_updated_at
before update on public.parties
for each row execute function public.set_updated_at();

create table if not exists public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.party_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_location extensions.geography(Point, 4326),
  last_speed_kmh numeric(6,2),
  last_heading numeric(5,2),
  last_seen_at timestamptz,
  is_muted boolean not null default false,
  primary key (party_id, user_id)
);

create index if not exists party_members_user_idx on public.party_members (user_id);

create or replace function public.is_party_member(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.party_members pm
    where pm.party_id = p_party_id
      and pm.user_id = auth.uid()
      and pm.left_at is null
  );
$$;

create or replace function public.is_party_host(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.parties p
    where p.id = p_party_id and p.host_id = auth.uid()
  );
$$;

create table if not exists public.party_messages (
  id bigint generated always as identity primary key,
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists party_messages_party_idx on public.party_messages (party_id, created_at desc);

-- Unirse por código (security definer para no exponer la party antes de entrar).
create or replace function public.join_party(p_code text)
returns public.parties
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party public.parties;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_party
  from public.parties
  where invite_code = upper(trim(p_code))
    and status in ('scheduled', 'live')
    and expires_at > now()
  limit 1;

  if v_party.id is null then
    raise exception 'party_not_found';
  end if;

  select count(*) into v_count
  from public.party_members
  where party_id = v_party.id and left_at is null;

  if v_count >= v_party.max_members
     and not exists (select 1 from public.party_members where party_id = v_party.id and user_id = auth.uid()) then
    raise exception 'party_full';
  end if;

  insert into public.party_members (party_id, user_id, role)
  values (v_party.id, auth.uid(), 'member')
  on conflict (party_id, user_id) do update set left_at = null;

  return v_party;
end;
$$;

-- ----------------------------------------------------------------------------
-- Combustible
-- ----------------------------------------------------------------------------
create table if not exists public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  filled_at timestamptz not null default now(),
  odometer_km numeric(12,1) not null check (odometer_km >= 0),
  volume_l numeric(10,3) not null check (volume_l > 0),
  price_per_l numeric(10,3) not null check (price_per_l >= 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  currency_code char(3) not null default 'DOP',
  station text,
  is_full_tank boolean not null default true,
  notes text check (char_length(notes) <= 300),
  receipt_url text,
  created_at timestamptz not null default now()
);

create index if not exists fuel_logs_vehicle_date_idx on public.fuel_logs (vehicle_id, filled_at desc);
create index if not exists fuel_logs_user_date_idx on public.fuel_logs (user_id, filled_at desc);

create or replace view public.vehicle_fuel_summary
with (security_invoker = true)
as
select
  vehicle_id,
  user_id,
  count(*)::integer as fillups,
  sum(volume_l) as total_liters,
  sum(total_cost) as total_cost,
  min(filled_at) as first_fill_at,
  max(filled_at) as last_fill_at,
  max(odometer_km) - min(odometer_km) as odometer_span_km
from public.fuel_logs
group by vehicle_id, user_id;

-- ----------------------------------------------------------------------------
-- Mantenimiento por vehículo (privado del propietario)
-- ----------------------------------------------------------------------------
create table if not exists public.vehicle_maintenance (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('oil', 'tires', 'brakes', 'battery', 'filters', 'inspection', 'other')),
  title text not null check (char_length(title) between 1 and 100),
  service_date date not null default current_date,
  odometer_km numeric(12,1) not null check (odometer_km >= 0),
  cost numeric(12,2) not null default 0 check (cost >= 0),
  shop text check (char_length(shop) <= 120),
  notes text check (char_length(notes) <= 500),
  next_km numeric(12,1) check (next_km >= 0),
  created_at timestamptz not null default now()
);

create index if not exists vehicle_maintenance_vehicle_date_idx
  on public.vehicle_maintenance (vehicle_id, service_date desc);

-- ----------------------------------------------------------------------------
-- Feed social
-- ----------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  drive_id uuid references public.drives(id) on delete set null,
  party_id uuid references public.parties(id) on delete set null,
  kind public.post_kind not null default 'photo',
  caption text check (char_length(caption) <= 500),
  visibility public.privacy_level not null default 'friends',
  created_at timestamptz not null default now()
);

create index if not exists posts_user_created_idx on public.posts (user_id, created_at desc);
create index if not exists posts_created_idx on public.posts (created_at desc);

create or replace function public.can_view_post(viewer uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and (
        p.user_id = viewer
        or p.visibility = 'public'
        or (p.visibility = 'friends' and public.are_friends(viewer, p.user_id))
      )
  );
$$;

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  url text not null,
  type public.media_type not null default 'image',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_idx on public.post_media (post_id, position);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.saves (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Clubs y quedadas (fase 2)
-- ----------------------------------------------------------------------------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,80}$'),
  description text,
  avatar_url text,
  cover_url text,
  city text,
  country_code char(2),
  privacy public.privacy_level not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clubs_city_idx on public.clubs (city);

drop trigger if exists clubs_set_updated_at on public.clubs;
create trigger clubs_set_updated_at
before update on public.clubs
for each row execute function public.set_updated_at();

create table if not exists public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create or replace function public.is_club_member(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.club_members cm
    where cm.club_id = p_club_id and cm.user_id = auth.uid()
  );
$$;

create table if not exists public.meets (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete set null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  description text,
  location extensions.geography(Point, 4326),
  address text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  cover_url text,
  privacy public.privacy_level not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meets_starts_idx on public.meets (starts_at);
create index if not exists meets_location_gist_idx on public.meets using gist (location);

drop trigger if exists meets_set_updated_at on public.meets;
create trigger meets_set_updated_at
before update on public.meets
for each row execute function public.set_updated_at();

create table if not exists public.meet_attendees (
  meet_id uuid not null references public.meets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.meet_rsvp not null default 'going',
  created_at timestamptz not null default now(),
  primary key (meet_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Notificaciones, dispositivos, moderación y QR
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'vehicle', 'drive', 'party', 'post', 'comment', 'meet')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'nudity', 'dangerous_driving', 'impersonation', 'other')),
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists public.qr_scans (
  id bigint generated always as identity primary key,
  qr_slug text not null,
  kind text not null check (kind in ('profile', 'vehicle', 'party')),
  scanner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists qr_scans_slug_idx on public.qr_scans (qr_slug, created_at desc);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.drives enable row level security;
alter table public.drive_passengers enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.party_messages enable row level security;
alter table public.fuel_logs enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.saves enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.meets enable row level security;
alter table public.meet_attendees enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.reports enable row level security;
alter table public.qr_scans enable row level security;

-- Perfiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (public.can_view_profile(auth.uid(), id));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Vehículos
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles
  for select using (
    owner_id = auth.uid()
    or privacy = 'public'
    or (privacy = 'friends' and public.are_friends(auth.uid(), owner_id))
  );

drop policy if exists vehicles_insert on public.vehicles;
create policy vehicles_insert on public.vehicles
  for insert with check (owner_id = auth.uid());

drop policy if exists vehicles_update on public.vehicles;
create policy vehicles_update on public.vehicles
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles
  for delete using (owner_id = auth.uid());

-- Amigos
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert with check (requester_id = auth.uid() and status = 'pending');

drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update using (auth.uid() in (requester_id, addressee_id))
  with check (auth.uid() in (requester_id, addressee_id));

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete using (auth.uid() in (requester_id, addressee_id));

-- Bloqueos
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select using (blocker_id = auth.uid());

drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks
  for insert with check (blocker_id = auth.uid());

drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks
  for delete using (blocker_id = auth.uid());

-- Trayectos
drop policy if exists drives_select on public.drives;
create policy drives_select on public.drives
  for select using (public.can_view_drive(auth.uid(), id));

drop policy if exists drives_insert on public.drives;
create policy drives_insert on public.drives
  for insert with check (user_id = auth.uid());

drop policy if exists drives_update on public.drives;
create policy drives_update on public.drives
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists drives_delete on public.drives;
create policy drives_delete on public.drives
  for delete using (user_id = auth.uid());

-- Pasajeros
drop policy if exists drive_passengers_select on public.drive_passengers;
create policy drive_passengers_select on public.drive_passengers
  for select using (public.can_view_drive(auth.uid(), drive_id));

drop policy if exists drive_passengers_insert on public.drive_passengers;
create policy drive_passengers_insert on public.drive_passengers
  for insert with check (
    exists (select 1 from public.drives d where d.id = drive_id and d.user_id = auth.uid())
  );

drop policy if exists drive_passengers_delete on public.drive_passengers;
create policy drive_passengers_delete on public.drive_passengers
  for delete using (
    exists (select 1 from public.drives d where d.id = drive_id and d.user_id = auth.uid())
  );

-- Parties
drop policy if exists parties_select on public.parties;
create policy parties_select on public.parties
  for select using (
    host_id = auth.uid()
    or public.is_party_member(id)
    or (not is_private and status in ('scheduled', 'live'))
  );

drop policy if exists parties_insert on public.parties;
create policy parties_insert on public.parties
  for insert with check (host_id = auth.uid());

drop policy if exists parties_update on public.parties;
create policy parties_update on public.parties
  for update using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists parties_delete on public.parties;
create policy parties_delete on public.parties
  for delete using (host_id = auth.uid());

-- Miembros de party
drop policy if exists party_members_select on public.party_members;
create policy party_members_select on public.party_members
  for select using (public.is_party_member(party_id) or public.is_party_host(party_id));

drop policy if exists party_members_insert on public.party_members;
create policy party_members_insert on public.party_members
  for insert with check (user_id = auth.uid());

drop policy if exists party_members_update on public.party_members;
create policy party_members_update on public.party_members
  for update using (user_id = auth.uid() or public.is_party_host(party_id))
  with check (user_id = auth.uid() or public.is_party_host(party_id));

drop policy if exists party_members_delete on public.party_members;
create policy party_members_delete on public.party_members
  for delete using (user_id = auth.uid() or public.is_party_host(party_id));

-- Mensajes de party
drop policy if exists party_messages_select on public.party_messages;
create policy party_messages_select on public.party_messages
  for select using (public.is_party_member(party_id) or public.is_party_host(party_id));

drop policy if exists party_messages_insert on public.party_messages;
create policy party_messages_insert on public.party_messages
  for insert with check (
    user_id = auth.uid()
    and (public.is_party_member(party_id) or public.is_party_host(party_id))
  );

drop policy if exists party_messages_delete on public.party_messages;
create policy party_messages_delete on public.party_messages
  for delete using (user_id = auth.uid() or public.is_party_host(party_id));

-- Combustible
drop policy if exists fuel_logs_all on public.fuel_logs;
create policy fuel_logs_all on public.fuel_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Mantenimiento
alter table public.vehicle_maintenance enable row level security;

drop policy if exists vehicle_maintenance_owner on public.vehicle_maintenance;
create policy vehicle_maintenance_owner on public.vehicle_maintenance
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Posts
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select using (
    user_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'friends' and public.are_friends(auth.uid(), user_id))
  );

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert with check (user_id = auth.uid());

drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts
  for delete using (user_id = auth.uid());

-- Media
drop policy if exists post_media_select on public.post_media;
create policy post_media_select on public.post_media
  for select using (public.can_view_post(auth.uid(), post_id));

drop policy if exists post_media_insert on public.post_media;
create policy post_media_insert on public.post_media
  for insert with check (
    exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

drop policy if exists post_media_delete on public.post_media;
create policy post_media_delete on public.post_media
  for delete using (
    exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- Likes
drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes
  for select using (public.can_view_post(auth.uid(), post_id));

drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes
  for insert with check (user_id = auth.uid() and public.can_view_post(auth.uid(), post_id));

drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes
  for delete using (user_id = auth.uid());

-- Comentarios
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
  for select using (public.can_view_post(auth.uid(), post_id));

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
  for insert with check (user_id = auth.uid() and public.can_view_post(auth.uid(), post_id));

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- Guardados
drop policy if exists saves_all on public.saves;
create policy saves_all on public.saves
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Clubs
drop policy if exists clubs_select on public.clubs;
create policy clubs_select on public.clubs
  for select using (privacy = 'public' or public.is_club_member(id) or owner_id = auth.uid());

drop policy if exists clubs_insert on public.clubs;
create policy clubs_insert on public.clubs
  for insert with check (owner_id = auth.uid());

drop policy if exists clubs_update on public.clubs;
create policy clubs_update on public.clubs
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists clubs_delete on public.clubs;
create policy clubs_delete on public.clubs
  for delete using (owner_id = auth.uid());

drop policy if exists club_members_select on public.club_members;
create policy club_members_select on public.club_members
  for select using (public.is_club_member(club_id) or exists (
    select 1 from public.clubs c where c.id = club_id and c.privacy = 'public'
  ));

drop policy if exists club_members_insert on public.club_members;
create policy club_members_insert on public.club_members
  for insert with check (user_id = auth.uid());

drop policy if exists club_members_delete on public.club_members;
create policy club_members_delete on public.club_members
  for delete using (
    user_id = auth.uid()
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );

-- Quedadas
drop policy if exists meets_select on public.meets;
create policy meets_select on public.meets
  for select using (
    privacy = 'public'
    or host_id = auth.uid()
    or (club_id is not null and public.is_club_member(club_id))
  );

drop policy if exists meets_insert on public.meets;
create policy meets_insert on public.meets
  for insert with check (host_id = auth.uid());

drop policy if exists meets_update on public.meets;
create policy meets_update on public.meets
  for update using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists meets_delete on public.meets;
create policy meets_delete on public.meets
  for delete using (host_id = auth.uid());

drop policy if exists meet_attendees_select on public.meet_attendees;
create policy meet_attendees_select on public.meet_attendees
  for select using (
    exists (
      select 1 from public.meets m
      where m.id = meet_id
        and (m.privacy = 'public' or m.host_id = auth.uid()
          or (m.club_id is not null and public.is_club_member(m.club_id)))
    )
  );

drop policy if exists meet_attendees_all on public.meet_attendees;
create policy meet_attendees_all on public.meet_attendees
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notificaciones
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Dispositivos
drop policy if exists device_tokens_all on public.device_tokens;
create policy device_tokens_all on public.device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reportes
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select using (reporter_id = auth.uid());

-- QR scans (el escaneo web puede usar service role; la app autenticada inserta)
drop policy if exists qr_scans_insert on public.qr_scans;
create policy qr_scans_insert on public.qr_scans
  for insert with check (scanner_id is null or scanner_id = auth.uid());

drop policy if exists qr_scans_select on public.qr_scans;
create policy qr_scans_select on public.qr_scans
  for select using (
    scanner_id = auth.uid()
    or exists (select 1 from public.profiles p where p.qr_slug = qr_slug and p.id = auth.uid())
    or exists (select 1 from public.vehicles v where v.qr_slug = qr_slug and v.owner_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Retos / emparejamiento punto A → punto B
-- ----------------------------------------------------------------------------
-- Categorías separadas para coches, motos, EV y camiones. Una categoría
-- "mixed" permite rivales de distinta clase y se resuelve por llegada.
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  title text not null check (char_length(title) between 1 and 100),
  category public.challenge_category not null default 'mixed',
  status public.challenge_status not null default 'pending',
  mode text not null default 'scheduled' check (mode in ('instant', 'scheduled')),
  from_label text not null check (char_length(from_label) between 1 and 160),
  to_label text not null check (char_length(to_label) between 1 and 160),
  start_point extensions.geography(Point, 4326),
  end_point extensions.geography(Point, 4326),
  distance_m integer not null default 0 check (distance_m >= 0),
  starts_at timestamptz,
  finished_at timestamptz,
  rules text check (char_length(rules) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists challenges_host_idx on public.challenges (host_id, created_at desc);
create index if not exists challenges_status_idx on public.challenges (status, created_at desc);
create index if not exists challenges_code_idx on public.challenges (code);

drop trigger if exists challenges_set_updated_at on public.challenges;
create trigger challenges_set_updated_at
before update on public.challenges
for each row execute function public.set_updated_at();

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_kind public.vehicle_kind not null default 'car',
  status text not null default 'invited' check (status in ('invited', 'accepted', 'declined', 'finished', 'cancelled')),
  progress_pct numeric(5,2) not null default 0 check (progress_pct between 0 and 100),
  elapsed_s integer not null default 0 check (elapsed_s >= 0),
  finished_at timestamptz,
  finish_rank integer check (finish_rank > 0),
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists challenge_participants_user_idx
  on public.challenge_participants (user_id, created_at desc);
create index if not exists challenge_participants_challenge_idx
  on public.challenge_participants (challenge_id, finish_rank);

create or replace function public.is_challenge_host(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenges c
    where c.id = p_challenge_id and c.host_id = auth.uid()
  );
$$;

create or replace function public.is_challenge_participant(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id and cp.user_id = auth.uid()
  );
$$;

alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;

drop policy if exists challenges_select on public.challenges;
create policy challenges_select on public.challenges
  for select using (host_id = auth.uid() or public.is_challenge_participant(id));

drop policy if exists challenges_insert on public.challenges;
create policy challenges_insert on public.challenges
  for insert with check (host_id = auth.uid());

drop policy if exists challenges_update on public.challenges;
create policy challenges_update on public.challenges
  for update using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists challenges_delete on public.challenges;
create policy challenges_delete on public.challenges
  for delete using (host_id = auth.uid());

drop policy if exists challenge_participants_select on public.challenge_participants;
create policy challenge_participants_select on public.challenge_participants
  for select using (
    public.is_challenge_participant(challenge_id)
    or public.is_challenge_host(challenge_id)
  );

drop policy if exists challenge_participants_insert on public.challenge_participants;
create policy challenge_participants_insert on public.challenge_participants
  for insert with check (
    user_id = auth.uid() or public.is_challenge_host(challenge_id)
  );

drop policy if exists challenge_participants_update on public.challenge_participants;
create policy challenge_participants_update on public.challenge_participants
  for update using (
    user_id = auth.uid() or public.is_challenge_host(challenge_id)
  ) with check (
    user_id = auth.uid() or public.is_challenge_host(challenge_id)
  );

drop policy if exists challenge_participants_delete on public.challenge_participants;
create policy challenge_participants_delete on public.challenge_participants
  for delete using (
    user_id = auth.uid() or public.is_challenge_host(challenge_id)
  );

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'party_messages', 'parties', 'party_members', 'posts', 'likes',
      'comments', 'notifications', 'meets', 'challenges', 'challenge_participants'
    ]
    loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Storage (crear buckets desde el dashboard o con estas instrucciones)
-- ----------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public) values
--   ('avatars', 'avatars', true),
--   ('vehicles', 'vehicles', true),
--   ('posts', 'posts', false),
--   ('receipts', 'receipts', false)
-- on conflict (id) do nothing;
--
-- Políticas recomendadas:
--   avatars/vehicles: lectura pública, escritura solo del dueño (carpeta = auth.uid()).
--   posts/receipts: privados, lectura mediante URL firmada.
--   Limitar tamaño (5 MB imágenes, 50 MB vídeo) y tipos MIME.
-- ----------------------------------------------------------------------------

-- Fin del esquema.
