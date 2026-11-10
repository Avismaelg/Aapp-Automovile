-- MAPA-24: avisos con la app cerrada (Firebase Cloud Messaging). Cada
-- teléfono guarda su token; al llegar una invitación a un convoy, un reto o
-- una solicitud de amistad, un trigger llama a la Edge Function «push», que
-- envía el aviso por FCM a los teléfonos del destinatario.

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Cada uno ve y gestiona solo sus tokens. Un token que pasa a otra cuenta
-- (cierras sesión y entra otra persona en el mismo teléfono) se reasigna con
-- register_push_token.
drop policy if exists push_tokens_select on public.push_tokens;
create policy push_tokens_select on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_tokens_delete on public.push_tokens;
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_platform not in ('android', 'ios') or char_length(p_token) not between 20 and 4096 then
    raise exception 'invalid_token';
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- Configuración privada (fuera de la API): URL de la función y el secreto
-- compartido con ella. Lo rellena el script de despliegue.
create schema if not exists private;

create table if not exists private.push_config (
  key text primary key,
  value text not null
);
-- Sin políticas: nadie la lee por la API, solo las funciones internas.
alter table private.push_config enable row level security;

create extension if not exists pg_net with schema extensions;

create or replace function private.send_push(p_kind text, p_record jsonb)
returns void
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from private.push_config where key = 'url';
  select value into v_secret from private.push_config where key = 'secret';
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('kind', p_kind, 'record', p_record),
    timeout_milliseconds := 5000
  );
exception when others then
  -- Un aviso que no sale nunca debe impedir la invitación.
  null;
end;
$$;

create or replace function private.push_party_invite()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'pending' then perform private.send_push('party_invite', to_jsonb(new)); end if;
  return new;
end;
$$;

drop trigger if exists party_invites_push on public.party_invites;
create trigger party_invites_push
  after insert on public.party_invites
  for each row execute function private.push_party_invite();

create or replace function private.push_challenge_invite()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status = 'invited' then perform private.send_push('challenge_invite', to_jsonb(new)); end if;
  return new;
end;
$$;

drop trigger if exists challenge_participants_push on public.challenge_participants;
create trigger challenge_participants_push
  after insert on public.challenge_participants
  for each row execute function private.push_challenge_invite();

create or replace function private.push_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.status::text = 'pending' then perform private.send_push('friend_request', to_jsonb(new)); end if;
  return new;
end;
$$;

drop trigger if exists friendships_push on public.friendships;
create trigger friendships_push
  after insert on public.friendships
  for each row execute function private.push_friend_request();
