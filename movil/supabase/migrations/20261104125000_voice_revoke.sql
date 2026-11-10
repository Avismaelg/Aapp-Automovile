-- P1-3 (docs/AUDITORIA-PRODUCCION.md): al salir o ser expulsado del convoy se
-- echa de la sala de voz en el momento (Edge Function livekit-revoke), sin
-- depender de que caduque el token. Usa el mismo canal que los avisos
-- (private.push_config: url de «push» y su secreto).

create or replace function private.voice_revoke()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_room text;
begin
  if old.left_at is not null or new.left_at is null then return new; end if;
  select value into v_url from private.push_config where key = 'url';
  select value into v_secret from private.push_config where key = 'secret';
  if v_url is null or v_secret is null then return new; end if;
  select voice_room into v_room from public.parties where id = new.party_id;
  if v_room is null then return new; end if;
  perform net.http_post(
    url := regexp_replace(v_url, '/push$', '/livekit-revoke'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('party_id', new.party_id, 'user_id', new.user_id, 'voice_room', v_room),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Echar de la sala nunca debe impedir salir del convoy.
  return new;
end;
$$;

revoke all on function private.voice_revoke() from public, anon, authenticated;

drop trigger if exists party_members_voice_revoke on public.party_members;
create trigger party_members_voice_revoke
  after update of left_at on public.party_members
  for each row execute function private.voice_revoke();
