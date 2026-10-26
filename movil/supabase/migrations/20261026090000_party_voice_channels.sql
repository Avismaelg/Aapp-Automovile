-- Tres canales de voz por party: Convoy, Ruta y Charla.
create table if not exists public.party_voice_channels (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  slug text not null check (slug in ('convoy', 'route', 'chat')),
  name text not null check (char_length(name) between 1 and 40),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (party_id, slug)
);

create index if not exists party_voice_channels_party_idx
  on public.party_voice_channels (party_id, position);

alter table public.party_members
  add column if not exists voice_channel_slug text not null default 'convoy'
  check (voice_channel_slug in ('convoy', 'route', 'chat'));

create or replace function public.create_party_voice_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.party_voice_channels (party_id, slug, name, position)
  values
    (new.id, 'convoy', 'Convoy', 0),
    (new.id, 'route', 'Ruta', 1),
    (new.id, 'chat', 'Charla', 2)
  on conflict (party_id, slug) do nothing;
  return new;
end;
$$;

drop trigger if exists parties_create_voice_channels on public.parties;
create trigger parties_create_voice_channels
after insert on public.parties
for each row execute function public.create_party_voice_channels();

-- Backfill para parties existentes.
insert into public.party_voice_channels (party_id, slug, name, position)
select p.id, v.slug, v.name, v.position
from public.parties p
cross join (
  values
    ('convoy', 'Convoy', 0),
    ('route', 'Ruta', 1),
    ('chat', 'Charla', 2)
) as v(slug, name, position)
on conflict (party_id, slug) do nothing;

alter table public.party_voice_channels enable row level security;

drop policy if exists party_voice_channels_select on public.party_voice_channels;
create policy party_voice_channels_select on public.party_voice_channels
  for select using (
    public.is_party_member(party_id)
    or public.is_party_host(party_id)
  );

grant select on public.party_voice_channels to authenticated;
