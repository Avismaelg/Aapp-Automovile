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
| `movil/src/lib/tracking.ts` | Tarea de ubicación en segundo plano (TaskManager), arranque/parada/reanudación |
| `movil/src/lib/background-points.ts` | Lotes de puntos grabados en segundo plano y su recogida |
| `movil/src/hooks/useBackgroundTracking.ts` | Relanza o detiene el servicio al abrir la app según la preferencia |
| `movil/src/hooks/useTripRecorder.ts` | Une GPS, segundo plano y publicación de récords |
| `movil/app/rutas.tsx` | Pantalla **Mis rutas** |

- **Local primero**: los viajes viven en `AsyncStorage` (`caravana.trips.v1`).
  Funcionan sin conexión y sobreviven a cerrar la app.
- **Inicio automático solo al conducir**: el viaje se abre cuando el GPS marca
  **15 km/h sostenidos en 3 muestras seguidas** (una caminata o un pico de ruido
  del GPS no abre ruta). Solo se acumulan puntos por encima de **8 km/h**, así
  que caminar después de aparcar no ensucia la ruta.
- El viaje se cierra tras **90 segundos sin movimiento de coche** (o al entrar
  en modo peatón); si el recorrido no llega a **200 m** se descarta. También se
  puede detener a mano en **Mis rutas**.
- **Puntos**: uno cada 15 m como mínimo, con velocidad y hora. Se guardan como
  máximo 700 puntos (se simplifican) y se conservan las últimas 30 rutas.
- **Estadísticas**: distancia, duración, velocidad media y máxima.
- **Segundo plano (24/7)**: `expo-task-manager` + `expo-location` con
  `foregroundService` (Android, sigue aunque se cierre la app desde recientes).
  - La tarea se define al cargar `app/_layout.tsx`, para que exista cuando el
    sistema despierta la app en segundo plano.
  - Cada lote de puntos se guarda en su propia clave (`caravana.bg-points.*`).
    La app los recoge al abrir, al volver a primer plano y cada 2 min, los
    ordena y los pasa al mismo grabador que el GPS en primer plano. Las muestras
    repetidas o anteriores a la última se ignoran.
  - Se descartan fixes con más de 100 m de error; si un punto llega sin
    velocidad se calcula con el anterior.
  - Si pasan más de 10 min sin muestras el viaje se cierra donde se perdió la
    señal. Los viajes recuperados del segundo plano se ordenan por inicio.
  - La preferencia de tracking se guarda (`caravana.session.v1`). Al abrir la
    app se relanza el servicio si el sistema lo paró (reinicio, ahorro de
    batería); sin permiso "siempre" se muestra en pausa.
  - Límites del sistema: en iOS, cerrar la app deslizándola detiene el GPS
    hasta reabrirla; en Android, tras reiniciar el teléfono hay que abrir la app
    una vez. Algunas marcas cortan servicios por ahorro de batería.
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

## 5. Coche aparcado

- El gancho `useParkingDetector` guarda el **último punto en movimiento** cuando
  el coche lleva 90 segundos por debajo de 2,5 km/h (si antes se movió a más de
  10 km/h). Se persiste en `caravana.parking.v1`, así que sobrevive al cierre de
  la app y a estar sin conexión.
- Al abrir la app con el coche ya aparcado se toma como referencia el último
  punto de la ruta más reciente (menos de 24 h).
- El mapa dibuja el coche aparcado con un marcador cian y una **línea guía
  discontinua** desde tu posición (solo si estás a más de 40 m).
- En Inicio aparece la píldora **"Tu coche aparcado · N m"**: al tocarla se
  traza la ruta por calles hasta el coche (destino "Mi coche"); una pulsación
  larga permite olvidar la ubicación guardada.
- **Modo caminando**: cuando te alejas más de 25 m del coche a menos de 8 km/h,
  el mapa cambia solo: el **coche 3D se queda aparcado** en su punto (con la
  etiqueta de distancia) y tu posición pasa a mostrarse con un **muñeco peatón**
  que sigue el GPS, con la cámara más baja (45°) y sin rotar. Al volver al coche
  o superar 8 km/h vuelve el modo coche; si te alejas más de 200 m conduciendo,
  el aparcamiento viejo se olvida.

## 6. Optimización aplicada
- **Party en vivo**: los cambios de `party_members` y `parties` ahora parchean
  la caché de React Query en vez de invalidarla. Antes cada latido de cada
  miembro (5 s) recargaba la party entera con perfiles; ahora solo se recarga
  cuando cambia la estructura (altas, bajas o fin de party).
- **Posición de party**: no se escribe en Supabase si el coche no se movió 5 m
  en los últimos 30 s (menos escrituras y menos tráfico Realtime).
- **Persistencia de rutas**: el viaje activo se guarda aparte cada 12 s (pocos
  KB) y el archivo completo (hasta 30 rutas) solo al cerrar un viaje. Antes se
  reescribía todo el historial cada 8 s en plena conducción.
- **React Query**: `gcTime` de 10 minutos y sin refetch al recuperar foco de la
  ventana; menos peticiones al cambiar de pestaña.
- **Récords**: la mejor marca local solo revisa las 10 rutas más recientes.
- **Mapa**: se retiró la instrumentación de debug; los errores de dibujo del
  coche avisan una sola vez por sesión.
- **Brújula ligera**: el rumbo del teléfono se publica como mucho cada 900 ms y
  solo si cambió más de 6°, así el mapa gira fluido sin re-renderizar la
  pantalla decenas de veces por segundo.
- **Menos mensajes al WebView**: el wrapper del mapa ignora posiciones repetidas
  (compara coordenadas, rumbo, velocidad y precisión redondeados).
- **Círculo de precisión**: se regenera como mucho cada 10 s o si la precisión
  cambia >20 % (antes, en cada señal GPS).
- **Línea del coche aparcado**: máximo una actualización cada 1,5 s.
- **Coche 3D**: no se redibuja si el encuadre no cambió y el canvas usa como
  máximo 1,5× de densidad de píxeles (antes 2×).
- **Progreso de ruta**: solo se recalcula cuando cambian las coordenadas, no con
  cada actualización de rumbo.


