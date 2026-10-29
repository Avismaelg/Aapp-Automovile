# Caravana — Mapa 3D y ubicación en tiempo real

> Estado: la pestaña **Inicio** es la pantalla inicial personal de la app
> (estilo Waze): tu coche, tu destino y tus amigos en el mapa. Usa MapLibre GL
> en 3D sobre datos de OpenStreetMap/OpenFreeMap, muestra edificios y relieve,
> sigue la posición y el rumbo del vehículo con asistencia de conducción y
> frenado. La Party tiene su propio mapa en la pestaña Party. Probado en web y
> en Android (development build).

---

## 1. Qué se implementó

- Mapa vectorial 3D con **MapLibre GL JS 5.24.0**.
  - Estilo oscuro de **OpenFreeMap** (`tiles.openfreemap.org/styles/dark`), sin
    API key.
  - Edificios en 3D por extrusión (`fill-extrusion`) con `render_height` y
    `render_min_height`.
  - Relieve real con teselas **Terrarium** de AWS (Mapzen/NASA/USGS) y
    exageración 1.
  - Atribución obligatoria en la interfaz: OpenFreeMap, OpenMapTiles,
    OpenStreetMap y relieve Mapzen.
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
- **Modo de videojuego (estilo Forza Horizon)**: al elegir una ruta o pulsar
  **Navegar**, el mapa pasa a pantalla completa: bandera **CONVOY** con el
  nombre de la party, ETA y distancia grandes y velocímetro; las únicas
  opciones son **Cambiar ruta** y **Cerrar ruta**.
- **Asistencia de conducción**: banderas de checkpoint repartidas a lo largo de
  la ruta (cada 500 m, máx. 40), flecha guía 45 m delante del coche con el rumbo
  del tramo y **asistencia de frenado**: los próximos 400 m de ruta se pintan
  **verde** (sin problema), **amarillo** (curva moderada) o **rojo** (curva
  cerrada cerca: frena ya). La flecha guía toma el color de la próxima curva.
- **Retar desde la party**: cada piloto del convoy es un botón para retarlo a
  llegar primero (reto instantáneo de llegada, nunca por velocidad) y hay
  **Retar al convoy** para todo el grupo; además **Mapa del convoy** salta al
  mapa en modo de videojuego.
- Vehículo 3D:
  - modelo procedural con Three.js 0.186.1 (sin GLB), dibujado sobre el mapa con
    la misma inclinación de la cámara; mide unos 60 px de largo en cualquier zoom;
    hay modelos de coche, moto y camión según el vehículo principal del garaje
    (el EV usa el modelo del coche);
  - la posición sale de `map.project()` en cada frame y el giro del rumbo GPS se
    calcula relativo a la vista, así apunta bien con el mapa girado o inclinado;
  - el color lo elige el vehículo principal (`vehicle`) y pinta carrocería, halo y
    flecha de respaldo;
  - si Three.js o WebGL fallan, se muestra la flecha 2D (`data-car="2d"`);
  - la cámara se centra en el vehículo con inclinación de 60° y zoom 16,5;
  - el rumbo del GPS gira la cámara (heading-up) cuando el vehículo se mueve;
  - parado, el coche conserva el último rumbo válido.
- Controles:
  - **3D/2D**: 2D mantiene el seguimiento y el rumbo, pero con inclinación 0;
  - **recentrar**: solo aparece si el usuario movió el mapa;
  - arrastrar, rotar o inclinar el mapa suelta el seguimiento;
  - el botón de recentrar vuelve a seguirlo con zoom 16,5.
- Marcadores de la party con inicial, color, nombre y pulso al hablar.
- Destino con bandera y etiqueta.
- Ruta estilo Waze:
  - cinta gruesa con **casing oscuro**, cuerpo naranja y **brillo interior**;
    ancho dependiente del zoom;
  - **flechas de dirección** repetidas a lo largo de la ruta;
  - la ruta directa de fallback se pinta en lima;
  - arterias y autopistas resaltadas sobre la base y etiquetas de negocios
    ocultas para reducir ruido visual.
- HUD con velocidad (`coords.speed`), estado GPS/demo y botones rápidos a Party,
  Retos, Repostar y Conducir.
- Aviso de permiso/error con **REINTENTAR** y aviso de error del mapa con
  reintento que remonta el WebView/iframe.

Archivos principales:

| Archivo | Función |
|---|---|
| `movil/src/lib/map-html.ts` | HTML estático del mapa, estilo, capas 3D, cámara y protocolo |
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
  ├─ location     posición, rumbo, precisión y velocidad
  ├─ members      miembros de la party
  ├─ destination  destino de la party
  ├─ route        coordenadas, distancia, tiempo y motor
  ├─ mode         "2d" | "3d"
  ├─ vehicle      color y tipo del vehículo (coche, moto, EV, camión)
  └─ recenter     volver a seguir el vehículo

Mapa
  ├─ ready        el estilo y las capas están listos
  ├─ follow       el usuario soltó o recuperó el seguimiento
  └─ error        WebGL, red o tiempo de carga
```

- Cada comando lleva un `seq` para ignorar mensajes duplicados (Android e iOS
  pueden entregar `postMessage` por `document` y por `window`).
- Al recibir `ready`, el componente envía el estado completo; así no se pierde
  ninguna actualización temprana.
- En nativo se usa `react-native-webview` con `androidLayerType="hardware"`.
- En web se usa un `iframe` con `srcDoc`.
- `WorldMap` mantiene la misma API en Party y en Mapa: `members`, `destination`,
  `location`, `route`, `mode`, `recenterToken`, `onFollowChange` y `onError`.

### Cámara

- **Cámara de persecución**: inclinación 65° y zoom 17; el padding deja el coche
  abajo en pantalla (55 % arriba, 10 % abajo) para ver hacia adelante, como una
  cámara 360 montada detrás del vehículo. El padding se recalcula al cambiar el
  tamaño del contenedor.
- Para que el seguimiento sea fluido, la cámara no salta a cada señal GPS:
  proyecta a donde estará el coche con su velocidad (2,2 s de anticipación) y
  desliza con easing lineal durante ~1,9 s hasta ese punto. El rumbo se
  suaviza con un filtro (el GPS tiembla ±20°) y solo re-anima si el coche se
  movió más de 8 m o giró más de 6°.
- `easeTo` mueve centro, rumbo e inclinación; el zoom solo cambia al iniciar o
  recentrar (o si el zoom quedó por debajo del de seguimiento).
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
- Los eventos `dragstart`, `rotatestart` y `pitchstart` con `originalEvent`
  desactivan el seguimiento; los movimientos programáticos no.
- Los marcadores se reproyectan cuando carga el terreno (`sourcedata`), porque
  el DEM cambia la altura de la cámara sin emitir `move`. Sin esto el vehículo
  quedaba unos 140 px desplazado al arrancar.
- El coche no es una capa de MapLibre: es un `canvas` de Three.js superpuesto
  (`pointer-events: none`) que se redibuja en cada `render` del mapa. Las capas
  personalizadas de MapLibre dejaron de dibujarse con terreno e inclinación en las
  pruebas, así que el coche se dibuja fuera del motor. Como efecto, ningún edificio
  lo tapa.

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
- sin GraphHopper o si falla, usa `fallbackRoute` y pinta la línea en lima.
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
  memoria. Existe vista 2D y un aviso si WebGL no está disponible.
- La pestaña Party monta un segundo mapa 3D mientras está abierta. Al volver al
  mapa principal se conserva el primero.
- MapLibre y Three.js se cargan desde unpkg y jsDelivr, y el estilo/teselas desde
  OpenFreeMap. La búsqueda usa Photon (photon.komoot.io) y las rutas de respaldo
  el OSRM público (router.project-osrm.org). Son servicios públicos gratuitos:
  para producción hay que fijar versión, tener un plan de teselas y hospedar el
  motor de rutas. Sin Three.js el coche se ve como flecha 2D.
- No hay mapas offline ni caché de teselas.
- No hay navegación giro a giro ni CarPlay/Android Auto nativos.
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
2. Comprobar `ready`, inclinación 60°, relieve activo, capa
   `caravana-buildings-3d` y capa de ruta.
3. Enviar rumbo 90° y velocidad 40 km/h: la cámara gira a 90°, se centra en la
   nueva posición y mantiene la inclinación.
4. Enviar rumbo 200°: MapLibre lo normaliza a −160°, el mismo rumbo.
5. Arrastrar con el ratón: `data-follow=off`, el mapa se mueve y aparece
   *Recentrar mapa*.
6. Pulsar recentrar: `data-follow=on`, zoom 16,5 y centro sobre el vehículo.
7. Cambiar a 2D: `data-mode=2d` y `pitch=0`.
8. Actualizar miembros/destino/ruta por mensaje: marcadores, pulso de hablando,
   etiqueta escapada y ruta convertida a `[lng, lat]`.
9. Abrir Party y volver: conviven dos mapas 3D, cada uno con su estado, sin
   errores de consola.
10. Recargar: el vehículo queda alineado con el centro con relleno (410 px =
    410 px).
11. Abrir `/actividad` y volver: regresa al mapa, que sigue listo.
12. Coche 3D: `data-car=3d`, canvas `#caravana-car` visible y marcador con clase
    `is-3d`. Con rumbo 90° y bearing 0° el coche apunta al este; con bearing 90°
    apunta arriba. El comando `vehicle` cambia el color de la pintura.
13. Bloquear `three@0.186.1` (Playwright `route`): `data-car=2d`, sin canvas y la
    flecha visible en el centro.

Resultado: `tsc` y `expo lint` correctos. Coche 3D comprobado en web (pasos 12 y
13). Consola sin errores; solo avisos internos de MapLibre.
