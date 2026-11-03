-- Convoy con usuarios reales.
--
-- 1. Quien va contigo en una party activa ve tu perfil básico (nombre, foto,
--    usuario) aunque tu perfil sea «Solo amigos» o «Privado». Antes salían
--    como «Piloto», sin foto y todos del mismo color.
-- 2. Salir de la party siendo anfitrión ya no la termina para todos: el mando
--    pasa al miembro que lleva más tiempo. Solo si no queda nadie se termina.

create or replace function private.shares_live_party(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from public.party_members mine
    join public.party_members theirs on theirs.party_id = mine.party_id
    join public.parties p on p.id = mine.party_id
    where mine.user_id = viewer and mine.left_at is null
      and theirs.user_id = target and theirs.left_at is null
      and p.status in ('scheduled', 'live')
  );
$$;

create or replace function private.can_view_profile(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select target = viewer or (
    not private.is_blocked(viewer, target)
    and (
      exists(
        select 1 from public.profiles p
        where p.id = target
          and (p.privacy = 'public' or (p.privacy = 'friends' and private.are_friends(viewer, target)))
      )
      or (viewer is not null and private.shares_live_party(viewer, target))
    )
  );
$$;

revoke all on function private.shares_live_party(uuid, uuid) from public;
grant execute on function private.shares_live_party(uuid, uuid) to authenticated, anon;

create or replace function private.leave_party(p_party_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_next uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select host_id into v_host from public.parties where id = p_party_id for update;
  if v_host is null then raise exception 'party_not_found'; end if;

  update public.party_members
     set left_at = now(), last_lat = null, last_lng = null
   where party_id = p_party_id and user_id = v_uid and left_at is null;

  if v_host <> v_uid then return; end if;

  select user_id into v_next
  from public.party_members
  where party_id = p_party_id and left_at is null
  order by joined_at asc
  limit 1;

  if v_next is null then
    update public.parties set status = 'ended', ends_at = now() where id = p_party_id;
  else
    update public.parties set host_id = v_next where id = p_party_id;
    update public.party_members set role = 'host' where party_id = p_party_id and user_id = v_next;
    update public.party_members set role = 'member' where party_id = p_party_id and user_id = v_uid;
  end if;
end;
$$;

create or replace function public.leave_party(p_party_id uuid) returns void
language sql security invoker set search_path = public, private as $$
  select private.leave_party(p_party_id);
$$;

revoke all on function private.leave_party(uuid) from public, anon;
revoke all on function public.leave_party(uuid) from public, anon;
grant execute on function private.leave_party(uuid) to authenticated;
grant execute on function public.leave_party(uuid) to authenticated;
