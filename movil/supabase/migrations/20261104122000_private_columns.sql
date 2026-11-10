-- P0-3 / P1-8 (docs/AUDITORIA-PRODUCCION.md): la matrícula y la ubicación de
-- casa nunca salen por la API, aunque el vehículo o el perfil sean públicos.
--
-- Antes: vehicles_select devolvía la fila entera de los vehículos públicos (el
-- valor por defecto), matrícula incluida, también a visitantes sin sesión; y
-- profiles devolvía home_location con el perfil.
--
-- Las políticas RLS filtran filas, no columnas: se quita el SELECT de tabla y
-- se concede columna a columna, sin plate ni home_location. Una columna nueva
-- en estas tablas no se ve hasta añadirla aquí (lo vigila db-permissions.test).
-- El odómetro sigue visible en los vehículos públicos: lo enseña la ficha de
-- venta, que el dueño publica a propósito.

revoke select on public.vehicles from anon, authenticated;
grant select (
  id, owner_id, make, model, year, nickname, color, photo_url, kind, fuel_kind,
  efficiency, efficiency_unit, battery_kwh, odometer_km, is_primary, privacy, qr_slug,
  created_at, updated_at
) on public.vehicles to anon, authenticated;

revoke select on public.profiles from anon, authenticated;
grant select (
  id, username, display_name, first_name, last_name, bio, avatar_url, cover_url, city,
  country_code, qr_slug, privacy, show_plate, unit_system, currency_code, created_at, updated_at
) on public.profiles to anon, authenticated;

-- La matrícula, solo para su dueño.
create or replace function public.my_vehicle_plates()
returns table (vehicle_id uuid, plate text)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.plate from public.vehicles v where v.owner_id = auth.uid();
$$;

revoke all on function public.my_vehicle_plates() from public, anon;
grant execute on function public.my_vehicle_plates() to authenticated;
