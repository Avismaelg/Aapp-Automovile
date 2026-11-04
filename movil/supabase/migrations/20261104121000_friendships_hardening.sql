-- P0-2 (docs/AUDITORIA-PRODUCCION.md): solo el destinatario responde una
-- solicitud de amistad y nadie cambia quién es quién.
--
-- Antes: friendships_update dejaba a los dos (remitente incluido) cambiar
-- cualquier columna: el remitente se aceptaba a sí mismo y veía la ubicación
-- en vivo del otro (friend_locations usa are_friends).

drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()));

-- Solo el estado y la hora de respuesta; los ids no se tocan.
revoke update on public.friendships from anon, authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

-- Transiciones permitidas desde la app: pendiente → aceptada o rechazada.
-- (Bloquear va por la tabla blocks; deshacer una amistad, con delete.)
create or replace function private.friendships_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.status::text <> 'pending' or new.status::text not in ('accepted', 'declined') then
      raise exception 'invalid_friendship_transition' using errcode = '42501';
    end if;
    -- Con un bloqueo de por medio no se acepta.
    if new.status::text = 'accepted' and private.is_blocked(new.addressee_id, new.requester_id) then
      raise exception 'blocked' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard
  before update on public.friendships
  for each row execute function private.friendships_guard();

-- Una solicitud nueva no puede saltarse un bloqueo (en cualquier sentido).
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (
    requester_id = (select auth.uid())
    and status = 'pending'
    and not private.is_blocked((select auth.uid()), addressee_id)
  );
