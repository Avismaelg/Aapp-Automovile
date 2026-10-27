# Caravana — Eventos con ruta

> Estado: cualquier usuario puede crear un evento público con **una ubicación**
> o con una **ruta completa de salida a meta** (hasta 5 puntos). La ruta se
> calcula por calles reales con OSRM y se muestra en el detalle del evento.

---

## 1. Qué se implementó

- Pantalla **Eventos** (`app/events.tsx`): lista pública de eventos con host,
  fecha, tipo (Ruta / Ubicación) y estadísticas de la ruta.
- Pantalla **Crear evento** (`app/event/new.tsx`):
  - título y descripción;
  - buscador de lugares (Photon/OSM) para añadir puntos: **Salida → paradas →
    Meta** (máximo 5);
  - con **1 punto** el evento es una ubicación; con **2 o más** se calcula la
    ruta completa por calles y se muestran distancia y duración antes de
    publicar.
- Pantalla **Detalle** (`app/event/[id].tsx`):
  - mapa con la ruta encuadrada completa (sin seguir al usuario), marcador de
    meta y el coche en su posición;
  - estadísticas, host, fecha y descripción;
  - **Navegar a la salida** (o al evento si es solo ubicación): fija el destino
    y abre el mapa en modo navegación;
  - compartir con enlace `caravana://event/<id>`.

## 2. Datos

- Tabla `public.events` (migración
  `movil/supabase/migrations/20261027120000_events.sql`):
  `id`, `host_id`, `host_name`, `title`, `description`, `starts_at`,
  `is_public`, `location_label`, `latitude`, `longitude`, `route` (jsonb con
  `[[lat,lng],…]`), `route_distance_m`, `route_time_ms`, `created_at`.
- RLS: lectura pública de eventos `is_public`; solo el dueño inserta y borra.
- **Local primero**: los eventos se guardan en `caravana.events.v1`
  (AsyncStorage) y funcionan sin conexión y en modo demo. Si la tabla remota no
  existe (migración sin aplicar), el evento queda local y la app lo avisa; no se
  pierde nada.

## 3. Rutas de varios puntos

`movil/src/lib/event-routes.ts` llama a OSRM con los waypoints separados por
`;`:

```
/route/v1/driving/{lng},{lat};{lng},{lat};…?overview=full&geometries=geojson
```

Devuelve la geometría completa (sigue calles), distancia y duración. La app
guarda la geometría en el evento para que el detalle no dependa del motor de
rutas.

## 4. Límites actuales

- Aplicar la migración de Supabase para publicar eventos para todos.
- Sin edición ni borrado de eventos desde la app (borrado solo por SQL/RLS).
- Sin participantes ni confirmación de asistencia (fase siguiente).
- Sin fecha/hora del evento: se ordena por fecha de creación.
