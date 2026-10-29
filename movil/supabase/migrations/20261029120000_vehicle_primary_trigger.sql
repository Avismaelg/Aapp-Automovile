-- Marcar un vehículo como principal desmarca el anterior en la misma
-- sentencia. Antes la app lo hacía en dos llamadas y, si la segunda fallaba,
-- el usuario se quedaba sin vehículo principal.
-- Sin security definer: la actualización sigue pasando por la RLS del dueño.
create or replace function private.unset_other_primary_vehicles()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.vehicles
     set is_primary = false
   where owner_id = new.owner_id
     and is_primary
     and id <> new.id;
  return new;
end;
$$;

drop trigger if exists vehicles_single_primary on public.vehicles;
create trigger vehicles_single_primary
before insert or update of is_primary on public.vehicles
for each row
when (new.is_primary)
execute function private.unset_other_primary_vehicles();
