# Caravana — Rutas grabadas y récords de autopista

> Estado: la app graba cada viaje automáticamente en el dispositivo (también en
> segundo plano), guarda velocidad, distancia y duración, y publica récords de
> velocidad por tramo de autopista para que la comunidad compita. Falta probar
> la grabación de fondo en un recorrido real largo.

---

## 1. Grabación de rutas

Archivos:

| Archivo | Función |
|---|---|
| `movil/src/store/trips.ts` | Store local de viajes: inicio/fin automático, puntos y estadísticas |
| `movil/src/lib/background-location.ts` | Servicio de ubicación en segundo plano (TaskManager) |
| `movil/src/hooks/useTripRecorder.ts` | Une GPS, segundo plano y publicación de récords |
| `movil/app/rutas.tsx` | Pantalla **Mis rutas** |

- **Local primero**: los viajes viven en `AsyncStorage` (`caravana.trips.v1`).
  Funcionan sin conexión y sobreviven a cerrar la app.
- **Inicio automático**: cuando el GPS detecta movimiento a partir de 10 km/h se
  abre un viaje. Se cierra solo tras 5 minutos por debajo de 2,5 km/h (y al
  menos 200 m recorridos), o al pulsar detener en **Mis rutas**.
- **Puntos**: uno cada 15 m como mínimo, con velocidad y hora. Se guardan como
  máximo 700 puntos (se simplifican) y se conservan las últimas 30 rutas.
- **Estadísticas**: distancia, duración, velocidad media y máxima.
- **Segundo plano**: `expo-task-manager` + `expo-location` con `foregroundService`
  (Android) escriben los puntos en una cola local que se fusiona al abrir la app.
  Solo se activa si el usuario ya concedió el permiso "siempre".
- La pantalla **Inicio** muestra una píldora "Grabando ruta · N min · X km"
  mientras hay un viaje activo.

## 2. Récords públicos de autopista

Tablas (migración `highway_speed_records`):

- `highway_segments`: `slug`, `name`, `city`, `speed_limit_kmh`, `polyline`
  (`[[lat,lng],…]`). Lectura pública; se cargan por SQL/migración.
- `speed_records`: `segment_id`, `user_id`, `user_name`, `vehicle_name`,
  `max_speed_kmh`, `distance_m`, `recorded_at`, `is_public`. Lectura pública de
  los récords marcados como públicos; cada usuario solo inserta los suyos
  (`user_id = auth.uid()`).

Tramos iniciales: Autopista de las Américas, Duarte, del Coral y 30 de Mayo.

Detección (`movil/src/lib/highway-records.ts`):

- Al terminar un viaje se calcula la velocidad máxima **dentro de un corredor de
  160 m** alrededor de la polilínea de cada tramo.
- Solo se publica si supera **60 km/h** (evita récords de tráfico urbano).
- Si no hay conexión, el viaje queda marcado como pendiente y se reintenta en la
  siguiente apertura de la app.
- En modo demo no se envía nada: los récords son locales.

Pantalla **Récords** (`movil/app/records.tsx`): lista de tramos con el top 3
público, tu mejor marca y el límite de velocidad del tramo. Incluye un aviso de
conducción responsable.

## 3. Sin conexión

- Rutas, récords locales y el último destino (persistido con zustand) siguen
  disponibles.
- El mapa 3D necesita red para las teselas vectoriales y el relieve; sin
  conexión se muestra el último lienzo cargado y el destino, pero no garantiza
  calles nuevas.
- La búsqueda de destinos y el cálculo de ruta requieren conexión; si falla, se
  usa la ruta directa y se avisa.

## 4. Límites y pendientes

- Probar la grabación de fondo en un viaje real de más de 30 minutos.
- Los récords son por tramo y por viaje: no hay anti-trampas (GPS falso).
- Falta un editor de tramos desde la app; hoy se cargan por migración.
- Sin caché de teselas offline (MapLibre GL JS no la trae integrada).
