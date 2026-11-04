-- Arreglo: la migración de avisos quitó el uso del esquema private a los
-- usuarios y dejó sin funcionar salir / terminar el convoy, expulsar y las
-- funciones de ayuda de las políticas (private.are_friends…). Se devuelve
-- como estaba (production_reconcile y restore_anonymous_rls_helpers).
grant usage on schema private to anon, authenticated, service_role;

-- Lo de los avisos sigue cerrado: la configuración y sus funciones solo las
-- usan los triggers (security definer).
revoke all on private.push_config from public, anon, authenticated;
revoke all on function private.send_push(text, jsonb) from public, anon, authenticated;
revoke all on function private.push_party_invite() from public, anon, authenticated;
revoke all on function private.push_challenge_invite() from public, anon, authenticated;
revoke all on function private.push_friend_request() from public, anon, authenticated;
