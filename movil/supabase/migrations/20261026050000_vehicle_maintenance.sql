-- Mantenimientos por vehículo (privados del propietario).
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

alter table public.vehicle_maintenance enable row level security;

drop policy if exists vehicle_maintenance_owner on public.vehicle_maintenance;
create policy vehicle_maintenance_owner on public.vehicle_maintenance
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant select, insert, update, delete on public.vehicle_maintenance to authenticated;
