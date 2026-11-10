-- P1-4 (docs/AUDITORIA-PRODUCCION.md): archivos que no se pudieron borrar al
-- eliminar una cuenta. Solo bucket y ruta (sin más datos personales); la
-- función delete-account los reintenta en cada llamada y se borran de aquí al
-- conseguirlo. Fuera de la API: solo la usa la función con service_role.

create table if not exists private.storage_cleanup (
  bucket text not null,
  path text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  primary key (bucket, path)
);

alter table private.storage_cleanup enable row level security;
revoke all on private.storage_cleanup from public, anon, authenticated;

create or replace function public.queue_storage_cleanup(p_items jsonb) returns void
language sql security definer set search_path = public, private as $$
  insert into private.storage_cleanup (bucket, path)
  select item->>'bucket', item->>'path' from jsonb_array_elements(p_items) item
  where item->>'bucket' in ('posts', 'vehicles', 'avatars', 'receipts') and coalesce(item->>'path', '') <> ''
  on conflict (bucket, path) do nothing;
$$;

-- Los más antiguos primero; cuenta el intento.
create or replace function public.next_storage_cleanup(p_limit integer) returns table (bucket text, path text)
language sql security definer set search_path = public, private as $$
  update private.storage_cleanup c
     set attempts = c.attempts + 1, last_attempt_at = now()
   where (c.bucket, c.path) in (
     select q.bucket, q.path from private.storage_cleanup q
     order by q.created_at limit least(greatest(p_limit, 1), 1000)
   )
  returning c.bucket, c.path;
$$;

create or replace function public.finish_storage_cleanup(p_items jsonb) returns void
language sql security definer set search_path = public, private as $$
  delete from private.storage_cleanup c
  using jsonb_array_elements(p_items) item
  where c.bucket = item->>'bucket' and c.path = item->>'path';
$$;

-- Solo la Edge Function (service_role), nunca la app.
revoke all on function public.queue_storage_cleanup(jsonb) from public, anon, authenticated;
revoke all on function public.next_storage_cleanup(integer) from public, anon, authenticated;
revoke all on function public.finish_storage_cleanup(jsonb) from public, anon, authenticated;
grant execute on function public.queue_storage_cleanup(jsonb) to service_role;
grant execute on function public.next_storage_cleanup(integer) to service_role;
grant execute on function public.finish_storage_cleanup(jsonb) to service_role;
