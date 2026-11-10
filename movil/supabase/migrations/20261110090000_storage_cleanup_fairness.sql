-- Cola de archivos pendientes de borrar (private.storage_cleanup): reparto
-- justo de los reintentos.
--
-- Antes next_storage_cleanup ordenaba solo por created_at: si los 200 más
-- antiguos fallaban siempre (archivo que ya no existe, bucket con problemas),
-- se reintentaban ellos en cada llamada y los demás no salían nunca.
--
-- Ahora: primero los que nunca se han intentado y luego los que llevan más
-- tiempo sin intentarse; tras 10 intentos se dejan de reintentar (siguen en la
-- tabla para revisarlos a mano); y dos llamadas a la vez no cogen las mismas
-- filas (skip locked).

create or replace function public.next_storage_cleanup(p_limit integer) returns table (bucket text, path text)
language sql security definer set search_path = public, private as $$
  update private.storage_cleanup c
     set attempts = c.attempts + 1, last_attempt_at = now()
   where (c.bucket, c.path) in (
     select q.bucket, q.path from private.storage_cleanup q
     where q.attempts < 10
     order by q.last_attempt_at nulls first, q.created_at
     limit least(greatest(p_limit, 1), 1000)
     for update skip locked
   )
  returning c.bucket, c.path;
$$;

-- create or replace conserva los permisos; se repiten por si se aplica sola.
revoke all on function public.next_storage_cleanup(integer) from public, anon, authenticated;
grant execute on function public.next_storage_cleanup(integer) to service_role;
