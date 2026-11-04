-- P0-4 (docs/AUDITORIA-PRODUCCION.md): fuera la clasificación pública de
-- velocidad por tramo. Incentivaba correr y es motivo de rechazo en las
-- tiendas. La app ya no envía velocidades; las estadísticas por tramo se
-- calculan en el teléfono y sin velocidades (app/records.tsx).
--
-- Los registros existentes NO se borran (borrar datos de usuarios necesita
-- autorización; ver docs/PLAN-CORRECCIONES.md): pasan a privados y solo los ve
-- su dueño.

update public.speed_records set is_public = false where is_public;
alter table public.speed_records alter column is_public set default false;

drop policy if exists speed_records_read_public on public.speed_records;
drop policy if exists speed_records_read_own on public.speed_records;
create policy speed_records_read_own on public.speed_records
  for select to authenticated using (user_id = (select auth.uid()));

-- Nadie añade velocidades nuevas (las versiones viejas de la app fallan en
-- silencio, sin efecto para el usuario).
drop policy if exists speed_records_insert_own on public.speed_records;
revoke insert, update on public.speed_records from anon, authenticated;
