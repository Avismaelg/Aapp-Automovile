-- Modo del reto: sala inmediata o invitación programada.
alter table public.challenges
  add column if not exists mode text not null default 'scheduled'
  check (mode in ('instant', 'scheduled'));
