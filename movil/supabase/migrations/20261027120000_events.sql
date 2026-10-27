-- Eventos públicos con ubicación o ruta (salida, paradas y meta).
-- Aplicar en el SQL editor de Supabase cuando la tabla no exista.
-- Mientras no se aplique, la app guarda los eventos en el dispositivo.

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
create policy events_read on public.events
  for select using (is_public);

drop policy if exists events_insert on public.events;
create policy events_insert on public.events
  for insert with check (host_id = auth.uid());

drop policy if exists events_delete on public.events;
create policy events_delete on public.events
  for delete using (host_id = auth.uid());
