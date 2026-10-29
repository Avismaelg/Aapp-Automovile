# Caravana — Mapa y ubicación en tiempo real

> Estado: la pestaña **Inicio** es la pantalla inicial personal de la app: tu
> coche, tu destino y tus amigos en el mapa. Usa MapLibre GL en **2D plano**
> (sin inclinación ni edificios 3D) sobre un estilo claro de calles, sigue la
> posición y el rumbo del vehículo y guía giro a giro con voz. La Party tiene su
> propio mapa en la pestaña Party.

---

## 1. Qué se implementó

- Mapa vectorial 2D con **MapLibre GL JS 5.24.0**.
  - Estilo claro de calles: **MapTiler `streets-v2`** si hay clave
    (`EXPO_PUBLIC_MAPTILER_KEY`) y, si no, **OpenFreeMap `liberty`** sin API key.
  - Siempre plano: `maxPitch: 0` y el gesto de inclinar desactivado.
  - Se ocultan negocios, números de portal y flechas de sentido; los nombres de
    calles se mantienen.
  - Atribución obligatoria en la interfaz: OpenFreeMap/MapTiler, OpenMapTiles y
    OpenStreetMap.
- **Pantalla inicial**: `app/(tabs)/index.tsx`, personal y estilo Waze (pestaña
  **Inicio** en el tab bar, sin elementos de party). El antiguo dashboard pasó a
  `app/actividad.tsx`, accesible desde el botón de actividad del mapa.
- **Amigos en el mapa**: los amigos con posición conocida (su última party con
  ubicación compartida) aparecen como marcadores; al tocarlos se abre una hoja
  con **Invitar al convoy** (comparte el código de la party activa) y **Retar**
  (reto instantáneo de llegada). En demo se muestran los pilotos de ejemplo.
- **Buscar destino (tipo Waze)**: botón **¿A dónde vamos?** en el mapa abre
  `app/destino.tsx`: busca calles, ciudades y sitios con **Photon** (datos de
  OpenStreetMap, sin API key) sesgado hacia tu posición. Al elegir uno, la ruta
  se traza **por calles y carreteras reales**: GraphHopper primero y, si no
  responde, el servidor público de OSRM; la línea recta queda solo como último
  recurso.
- **Compartir la ruta**: el anfitrión pulsa **Compartir con la party** y el
  destino se guarda en la party (`RPC set_party_destination`, cualquier miembro
  activo puede fijarlo); todos la ven por Realtime. También hay **Compartir
  ruta** con un enlace `caravana://destino?lat=…&lng=…&label=…` que abre la app
  y ofrece aceptar la ruta.
- **Indicaciones giro a giro**: la ruta pide los pasos al motor (OSRM
  `steps=true`, GraphHopper `instructions=true`) y muestra la próxima maniobra
  con icono, texto y distancia («Gira a la derecha por Avenida Tiradentes ·
  180 m»), más el tiempo y la distancia **restantes** calculados con tu progreso
  real sobre la polilínea (punto más cercano).
- **Destinos recientes**: Inicio guarda los últimos 4 destinos y los muestra
  como chips para repetir la ruta con un toque.
- **Información de la vía (estilo Google Maps)**:
  - calle actual en el HUD (tramo de la ruta o, sin ruta, la vía que reporta OSM);
  - **límite de velocidad** leído de OpenStreetMap (Nominatim + API de OSM,
    máximo una consulta cada 20 s y 100 m); el cartel solo aparece donde OSM
    tiene la etiqueta `maxspeed` (en Santo Domingo la cobertura es escasa);
  - **hora de llegada** estimada junto al tiempo y los kilómetros restantes;
  - **círculo de precisión GPS** alrededor del coche;
  - botón **N** (brújula) para fijar el mapa al norte sin dejar de seguirte.
- Sin datos de **tráfico en tiempo real** ni **radares**: requieren un proveedor
  de tráfico de pago y Overpass (OSM) no respondió desde la red de pruebas.
- **Navegación**: al pulsar **Ir ahora** el mapa pasa a pantalla completa:
  - tarjeta azul arriba con la próxima maniobra (icono, distancia grande y
    calle) y una píldora **Luego** si la siguiente maniobra está a menos de
    400 m;
  - velocidad en una burbuja que se pone roja si superas el límite en más de
    5 km/h, botón **N** y botón de **voz**;
  - abajo, hora de llegada grande, tiempo y distancia restantes, **salir** y
    **cambiar destino**.
- **Avisos por voz** (`expo-speech`, `src/hooks/useVoiceGuidance.ts`): a unos
  800 m (solo a 60 km/h o más), a 300 m y en el punto de la maniobra; cada aviso
  se dice una vez. Se pueden silenciar.
- **Rutas alternativas**: se piden hasta 3 (OSRM `alternatives=3`, GraphHopper
  `algorithm=alternative_route`) y se ordenan por tiempo. Antes de salir se
  muestran en gris en el mapa y como opciones en la tarjeta de destino
  (**MÁS RÁPIDA** / **+N MIN**); se elige tocando la opción o la línea gris. Al
  recalcular por desvío se vuelve a la más rápida.
- **Retar desde la party**: cada piloto del convoy es un botón para retarlo a
  llegar primero (reto instantáneo de llegada, nunca por velocidad) y hay
  **Retar al convoy** para todo el grupo.
- Vehículo: flecha 2D con el color del vehículo principal y halo pulsante; gira
  con el rumbo GPS. Caminando hacia el coche aparcado se oculta y se muestra el
  peatón.
- Cámara:
  - rumbo arriba (heading-up) en marcha; parado conserva el último rumbo;
  - **zoom según la velocidad**: 17 en ciudad, 16,5 hasta 50 km/h, 16 hasta
    80 km/h y 15,3 en autopista; a menos de 250 m de una maniobra vuelve a 17;
  - parado respeta el zoom que elijas.
- Controles:
  - **recentrar**: solo aparece si el usuario movió el mapa;
  - arrastrar o rotar el mapa suelta el seguimiento.
- Marcadores de la party con inicial, color, nombre y pulso al hablar.
- Destino con bandera y etiqueta.
- Ruta:
  - cinta **azul** gruesa con borde azul oscuro y ancho según el zoom; lo ya
    recorrido queda en gris;
  - **flechas de dirección** blancas a lo largo de la ruta;
  - punto blanco con borde azul en el lugar exacto de la próxima maniobra.
- HUD con velocidad (`coords.speed`), estado GPS/demo y botones rápidos a Party,
  Retos, Repostar y Conducir.
- Aviso de permiso/error con **REINTENTAR** y aviso de error del mapa con
  reintento que remonta el WebView/iframe.

Archivos principales:

| Archivo | Función |
|---|---|
| `movil/src/lib/map-html.ts` y `movil/src/lib/map/` | HTML estático del mapa, estilo, capas, cámara y protocolo |
| `movil/src/components/WorldMap.tsx` | WebView nativo y envío de comandos |
| `movil/src/components/WorldMap.web.tsx` | iframe web y envío de comandos |
| `movil/src/hooks/useLiveLocation.ts` | suscripción GPS compartida |
| `movil/src/hooks/useGraphHopperRoute.ts` | ruta compartida y deduplicada |
| `movil/src/hooks/useParty.ts` | publicación de posición en la party |
| `movil/app/(tabs)/index.tsx` | pantalla Inicio: mapa personal |
| `movil/app/(tabs)/party.tsx` | mapa de la party con el mismo motor |

---

## 2. Arquitectura del mapa

El HTML se construye una sola vez y **no se recarga** con cada actualización.
React Native y el mapa se comunican con `postMessage`:

```
React Native / web
  ├─ location      posición, rumbo, precisión y velocidad
  ├─ members       miembros de la party
  ├─ destination   destino de la party
  ├─ route         ruta elegida: coordenadas, distancia, tiempo e instrucciones
  ├─ alternatives  otras rutas posibles (en gris)
  ├─ vehicle       color y tipo del vehículo
  └─ recenter      volver a seguir el vehículo

Mapa
  ├─ ready           el estilo y las capas están listos
  ├─ follow          el usuario soltó o recuperó el seguimiento
  ├─ alternativeTap  el usuario tocó una ruta alternativa
  └─ error           WebGL, red o tiempo de carga
```

- Cada comando lleva un `seq` para ignorar mensajes duplicados (Android e iOS
  pueden entregar `postMessage` por `document` y por `window`).
- Al recibir `ready`, el componente envía el estado completo; así no se pierde
  ninguna actualización temprana.
- En nativo se usa `react-native-webview` con `androidLayerType="hardware"`.
- En web se usa un `iframe` con `srcDoc`.
- `WorldMap` mantiene la misma API en Party y en Mapa: `members`, `destination`,
  `location`, `route`, `alternatives`, `recenterToken`, `onFollowChange`,
  `onAlternativePress` y `onError`.

### Cámara

- Mapa plano con el coche en el tercio inferior: el padding deja 55 % arriba y
  10 % abajo para ver más calle por delante. Se recalcula al cambiar el tamaño
  del contenedor.
- Para que el seguimiento sea fluido, la cámara no salta a cada señal GPS:
  proyecta a donde estará el coche con su velocidad (2,2 s de anticipación) y
  desliza con easing lineal durante ~1,9 s hasta ese punto. El rumbo se
  suaviza con un filtro (el GPS tiembla ±20°) y solo re-anima si el coche se
  movió más de 8 m o giró más de 6°.
- `easeTo` mueve centro y rumbo; en marcha también ajusta el zoom a la
  velocidad y a la cercanía de la próxima maniobra.
- **Siempre se vuelve a tu seguimiento**: al abrir la app, al volver a primer
  plano y al entrar en la pestaña Inicio, el mapa reengancha el seguimiento y
  hace zoom sobre tu posición (`useFocusEffect` + `AppState` + token de
  recentrar), aunque lo hubieras soltado arrastrando antes. Además, la primera
  posición de cada apertura fuerza el seguimiento y, si la cámara quedara a más
  de 800 m de ti, salta directamente a tu ubicación en vez de animar.
- **Tamaño del mapa en WebView**: `#map` va con `position: fixed; inset: 0` y se
  fuerza `map.resize()` al arrancar (50 ms, 900 ms y 2,5 s) con `ResizeObserver`
  para que el canvas ocupe siempre la pantalla completa aunque el WebView
  termine de maquetar tarde.
- Los eventos `dragstart` y `rotatestart` con `originalEvent` desactivan el
  seguimiento; los movimientos programáticos no.

---

## 3. Flujo de ubicación

```
App (mapa inicial)
  └─ useLiveLocation()               ← una sola suscripción GPS
       ├─ requestForegroundPermissionsAsync()
       ├─ getLastKnownPositionAsync()
       ├─ watchPositionAsync(2 s / 3 m, Accuracy.High)
       ├─ normaliza heading y speed (null/-1 → null)
       └─ fallback Santo Domingo a los 8 s sin GPS

Mapa
  └─ usePartyLocation(partyId, location, party && live)
       └─ publica last_lat/last_lng/last_seen_at cada 5 s
```

- La suscripción es un **store de módulo con contador de referencias**: mapa y
  Party comparten el mismo GPS y solo se cierra cuando ninguna pantalla lo usa.
- `usePartyLocation` lee siempre la última posición desde un `ref` y escribe cada
  5 s. Así el mapa puede refrescarse cada 2 s sin multiplicar escrituras.
- Solo hay un publicador de posición: el mapa inicial. La pestaña Party ya no
  escribe, para evitar dos escritores con la misma cuenta.
- Si el permiso se deniega o falla el GPS se muestra Santo Domingo y se avisa.
- La ubicación de demo **nunca** se publica en Supabase.
- Al salir de la party se limpian `last_lat`/`last_lng` del miembro.

### Rutas compartidas

`useGraphHopperRoute` usa un store de módulo y una única petición:

- debounce de 700 ms;
- recalcula si cambia el destino, si el origen se movió más de 250 m o si pasaron
  más de 2 minutos;
- si mapa y Party están montados, comparten la misma ruta y no duplican llamadas;
- si GraphHopper falla se usa el OSRM público; nunca una línea recta como ruta.
- La respuesta de GraphHopper llega como `[longitud, latitud]`; la app la guarda
  como `[latitud, longitud]` y el mapa la convierte a `[longitud, latitud]` para
  MapLibre.

---

## 4. Privacidad

- La ubicación se pide al abrir la app, porque el mapa es la pantalla inicial.
- No se comparte fuera de una party.
- Mientras hay una party activa, las coordenadas se guardan en Supabase y solo
  las leen el anfitrión y los miembros (RLS).
- El QR público no contiene ubicación.
- El tracking en segundo plano es independiente del mapa; se activa o pausa
  desde Perfil o Actividad y la preferencia se recuerda.

---

## 5. Límites actuales

- El mapa usa WebView + WebGL; en equipos de gama baja puede consumir batería y
  memoria. Hay un aviso si WebGL no está disponible.
- La pestaña Party monta un segundo mapa mientras está abierta. Al volver al
  mapa principal se conserva el primero.
- MapLibre se carga desde unpkg y el estilo/teselas desde OpenFreeMap o
  MapTiler. La búsqueda usa Photon (photon.komoot.io) y las rutas de respaldo el
  OSRM público (router.project-osrm.org). Son servicios públicos gratuitos:
  para producción hay que fijar versión, tener un plan de teselas y hospedar el
  motor de rutas.
- No hay mapas offline ni caché de teselas.
- Sin tráfico en tiempo real: las alternativas se ordenan por el tiempo que
  estima el motor de rutas, no por atascos reales.
- No hay CarPlay/Android Auto nativos.
- El relieve puede mostrar un aviso interno de `maxzoom` de elevación; no rompe
  el mapa.
- Falta probar en iPhone/Android reales: rendimiento, batería, permisos, túneles,
  reconexión y precisión del rumbo.
- El tracking en segundo plano sigue siendo un servicio aparte; el mapa no
  promete seguimiento con la app cerrada.

---

## 6. Producción

Antes de lanzar:

1. Elegir proveedor de teselas vectoriales (MapTiler, Stadia, Mapbox o
   OpenMapTiles/MapLibre autohospedado) y revisar su licencia y cuota.
2. Empaquetar MapLibre y el estilo en el bundle en vez de depender de unpkg.
3. Evaluar `@maplibre/maplibre-react-native` para render nativo y mejor batería.
4. Probar en dispositivos reales con EAS development build.
5. Añadir caché/offline y reconexión de teselas.
6. Añadir Presence explícita y limpieza de miembros inactivos en la party.
7. Considerar navegación turn-by-turn y avisos de tráfico.

---

## 7. Pruebas

```bash
cd movil
npx tsc --noEmit
npx eslint .
npx expo-doctor
npx expo export --platform web
```

Prueba manual/web realizada:

1. Abrir la app en demo: el mapa es la pantalla inicial.
2. Comprobar `ready`, `pitch=0` y capas `caravana-route-*`,
   `caravana-alt-*` y `caravana-maneuver`.
3. Enviar rumbo 90° y velocidad 40 km/h: la cámara gira a 90°, se centra en la
   nueva posición y ajusta el zoom a 16,5.
4. Arrastrar con el ratón: `data-follow=off`, el mapa se mueve y aparece
   *Recentrar mapa*.
5. Pulsar recentrar: `data-follow=on` y centro sobre el vehículo.
6. Elegir un destino: aparecen hasta 3 opciones; tocar una línea gris la
   selecciona.
7. Pulsar **Ir ahora**: tarjeta de maniobra, voz y hora de llegada.

Pendiente: probar la guía por voz y el zoom automático conduciendo en un
dispositivo real.
