-- generate_username solo la usa el alta (trigger handle_new_user, que corre
-- como su dueño). Abierta por la API dejaba a cualquiera, incluso sin cuenta,
-- probar nombres de usuario a ciegas. Se cierra para anon y authenticated.
revoke all on function public.generate_username() from public, anon, authenticated;
