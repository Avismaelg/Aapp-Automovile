-- Los helpers están fuera del esquema expuesto por PostgREST. Las políticas
-- RLS de perfiles y contenido público deben poder ejecutarlos también cuando
-- la solicitud llega con el rol anon; sin estos grants devuelven 401.
grant usage on schema private to anon;
grant execute on function private.are_friends(uuid,uuid) to anon;
grant execute on function private.is_blocked(uuid,uuid) to anon;
grant execute on function private.can_view_profile(uuid,uuid) to anon;
grant execute on function private.can_view_post(uuid,uuid) to anon;
grant execute on function private.can_view_drive(uuid,uuid) to anon;
grant execute on function private.is_club_member(uuid) to anon;
grant execute on function private.is_party_member(uuid) to anon;
grant execute on function private.is_party_host(uuid) to anon;
grant execute on function private.is_challenge_participant(uuid) to anon;
grant execute on function private.is_challenge_host(uuid) to anon;
