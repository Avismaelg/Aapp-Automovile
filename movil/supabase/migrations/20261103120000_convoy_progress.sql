-- Convoy (enmienda 1.1).
--
-- CONV-04/05: cada miembro publica su ETA y la distancia que le queda a la
--   meta común; la lista se ordena por quién llega antes.
-- CONV-06: llegada de cada miembro (arrived_at).
-- CONV-02: solo el anfitrión, o quien él autorice (rol «sweeper», que en la
--   app se llama copiloto), cambia el destino. Al cambiarlo se borran las
--   llegadas.
-- CONV-08: el anfitrión expulsa miembros, autoriza copilotos y termina el
--   convoy para todos.

alter table public.party_members
  add column if not exists eta_s integer check (eta_s >= 0),
  add column if not exists remaining_m integer check (remaining_m >= 0),
  add column if not exists progress_at timestamptz,
  add column if not exists arrived_at timestamptz;

create or replace function private.set_party_destination(p_party_id uuid, p_label text, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_host uuid; v_role public.party_role;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select host_id into v_host from public.parties where id = p_party_id;
  if v_host is null then raise exception 'party_not_found'; end if;
  select role into v_role from public.party_members
   where party_id = p_party_id and user_id = v_uid and left_at is null;
  if v_host <> v_uid and v_role is null then raise exception 'not_a_member'; end if;
  if v_host <> v_uid and v_role <> 'sweeper' then raise exception 'not_allowed'; end if;
  update public.parties
     set destination_label = nullif(trim(coalesce(p_label, '')), ''),
         destination_lat = p_lat,
         destination_lng = p_lng,
         destination_set_by = v_uid,
         destination_set_at = now()
   where id = p_party_id;
  update public.party_members
     set arrived_at = null, eta_s = null, remaining_m = null
   where party_id = p_party_id;
end;
$$;

create or replace function private.kick_party_member(p_party_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.parties where id = p_party_id and host_id = auth.uid()) then
    raise exception 'not_host';
  end if;
  if p_user_id = auth.uid() then raise exception 'cannot_kick_self'; end if;
  update public.party_members
     set left_at = now(), last_lat = null, last_lng = null
   where party_id = p_party_id and user_id = p_user_id and left_at is null;
end;
$$;

create or replace function private.set_party_member_role(p_party_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.parties where id = p_party_id and host_id = auth.uid()) then
    raise exception 'not_host';
  end if;
  if p_role not in ('member', 'sweeper') or p_user_id = auth.uid() then raise exception 'invalid_role'; end if;
  update public.party_members set role = p_role::public.party_role
   where party_id = p_party_id and user_id = p_user_id and left_at is null;
end;
$$;

create or replace function private.end_party(p_party_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.parties where id = p_party_id and host_id = auth.uid()) then
    raise exception 'not_host';
  end if;
  update public.parties set status = 'ended', ends_at = now() where id = p_party_id;
  update public.party_members
     set left_at = coalesce(left_at, now()), last_lat = null, last_lng = null
   where party_id = p_party_id;
end;
$$;

create or replace function public.kick_party_member(p_party_id uuid, p_user_id uuid) returns void
language sql security invoker set search_path = public, private as $$
  select private.kick_party_member(p_party_id, p_user_id);
$$;
create or replace function public.set_party_member_role(p_party_id uuid, p_user_id uuid, p_role text) returns void
language sql security invoker set search_path = public, private as $$
  select private.set_party_member_role(p_party_id, p_user_id, p_role);
$$;
create or replace function public.end_party(p_party_id uuid) returns void
language sql security invoker set search_path = public, private as $$
  select private.end_party(p_party_id);
$$;

revoke all on function private.kick_party_member(uuid, uuid) from public, anon;
revoke all on function private.set_party_member_role(uuid, uuid, text) from public, anon;
revoke all on function private.end_party(uuid) from public, anon;
revoke all on function public.kick_party_member(uuid, uuid) from public, anon;
revoke all on function public.set_party_member_role(uuid, uuid, text) from public, anon;
revoke all on function public.end_party(uuid) from public, anon;
grant execute on function private.kick_party_member(uuid, uuid) to authenticated;
grant execute on function private.set_party_member_role(uuid, uuid, text) to authenticated;
grant execute on function private.end_party(uuid) to authenticated;
grant execute on function public.kick_party_member(uuid, uuid) to authenticated;
grant execute on function public.set_party_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.end_party(uuid) to authenticated;
