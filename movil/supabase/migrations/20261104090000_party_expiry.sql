-- Las parties (convoys) y los retos duran 24 h desde que se crean y luego se borran con
-- todo lo suyo (miembros, chat, canales de voz, invitaciones: on delete
-- cascade). Antes expires_at existía pero nadie lo aplicaba y seguían «activas».

-- Que nadie alargue la vida de una party.
update public.parties
set expires_at = created_at + interval '24 hours'
where expires_at > created_at + interval '24 hours';

create or replace function public.purge_expired_parties()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.parties where expires_at <= now();
  get diagnostics v_count = row_count;
  -- Retos sin terminar a las 24 h: se cancelan (siguen en el historial).
  update public.challenges
  set status = 'cancelled', finished_at = coalesce(finished_at, now())
  where status in ('pending', 'accepted', 'live')
    and created_at <= now() - interval '24 hours';
  return v_count;
end;
$$;

revoke all on function public.purge_expired_parties() from public, anon, authenticated;

-- Cada 15 min con pg_cron (si el proyecto lo tiene disponible).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'caravana-purge-parties') then
      perform cron.unschedule('caravana-purge-parties');
    end if;
    perform cron.schedule('caravana-purge-parties', '*/15 * * * *', 'select public.purge_expired_parties()');
  end if;
end;
$$;

-- Limpieza inmediata de las que ya caducaron.
select public.purge_expired_parties();
