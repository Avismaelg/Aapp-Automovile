-- RNF-05: parties de hasta 10 miembros; 5 en el plan gratuito (el único que
-- existe en el MVP). El límite lo impone la base de datos (join_party y
-- accept_party_invite ya rechazan con «party_full» al llegar a max_members),
-- no solo la interfaz.

update public.parties set max_members = least(max_members, 10);
update public.parties set max_members = 5
where status in ('scheduled', 'live') and max_members > 5;

alter table public.parties drop constraint if exists parties_max_members_check;
alter table public.parties
  add constraint parties_max_members_check check (max_members between 2 and 10);
alter table public.parties alter column max_members set default 5;
