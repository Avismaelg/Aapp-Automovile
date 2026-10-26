-- Coordenadas numéricas para mapas en vivo y destinos de party.
alter table public.parties
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision;

alter table public.party_members
  add column if not exists last_lat double precision,
  add column if not exists last_lng double precision;

create index if not exists party_members_party_seen_idx
  on public.party_members (party_id, last_seen_at desc);
