# Trazabilidad del SRS — Caravana (IEEE 830, rev. 1.0, 02/11/2026)

Fuente de verdad: `docs/SRS-Caravana-IEEE830.docx`. Auditoría del código en `movil/` (app Expo) y
`movil/supabase/` (migraciones y Edge Functions).

Estados: ✅ CUMPLE · 🟡 PARCIAL · ❌ NO CUMPLE · ⛔ BLOQUEADO · ❓ NO VERIFICABLE EN CÓDIGO · ⏭ OMITIDO (decisión del propietario)

## Decisiones de interpretación

- **D-01 Mapa 3D omitido.** Por indicación del propietario (02/11/2026) no se audita ni se cambia el mapa 3D:
  SW-07 (MapLibre con edificios y relieve) y la parte «3D / vista 2D-3D» de RF-11 y UI-03 quedan ⏭.
  El mapa actual usa `@rnmapbox/maps` con estilos Mapbox; no se migra a MapLibre.
- **D-02 Idioma.** El SRS pide la interfaz «primero en español» (R-07) y «en español» (OTR-03). El español es el
  texto base del código y el idioma por defecto. El inglés es un idioma adicional que se puede elegir. Para no
  contradecir OTR-03, el modo automático solo pasa a inglés si el teléfono está en inglés; cualquier otro idioma usa español.
- **D-03 Monedas.** OTR-03 limita las monedas a DOP (por defecto), USD, EUR y MXN: la moneda del teléfono solo se
  usa si es una de esas cuatro; si no, DOP.
- **D-04 Ubicación con amigos fuera de la party.** RNF-10 dice que la ubicación solo se comparte dentro de una party
  activa. La función opcional «Mi ubicación para amigos» (tabla `friend_locations`) lo contradice: manda el SRS y
  se desactiva (no se borra el código ni la tabla).
- **D-05 Récords por tramo.** RF-16 pide «top 3 del tramo y mejor marca propia», pero R-06 y OTR-02 prohíben premiar
  la velocidad. La clasificación por velocidad máxima se sustituye por el **tiempo medio del tramo respetando el
  límite** (no se cuentan pasadas por encima del límite). Es la opción más fiel a ambos requisitos. ❓ AMBIGUO.
- **D-06 Modo demo sin variables de entorno.** RF-01 dice que sin variables de entorno la app entra en modo demo. En
  compilaciones de producción la app muestra un error de configuración (protección para no publicar una app «vacía»).
  Se mantiene así en producción y se cumple en desarrollo y vista previa. ❓ AMBIGUO.
- **D-07 Posición cada 3 s.** En movimiento se envía cada 3 s (COM-02); parado, cada 30 s (si no hay movimiento no
  cambia nada que enviar, y ahorra batería, R-08/RNF-06).

## Matriz

### Restricciones de diseño (2.4)

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| R-01 | TS + Expo 58 + Router + Zustand + TanStack Query | ✅ | `movil/package.json`, `app/_layout.tsx`, `src/store/*`, `src/hooks/use*.ts` | — | — |
| R-02 | Supabase con RLS en toda tabla | ✅ | 32 tablas en `supabase/migrations/*.sql`, todas con `enable row level security` | — | — |
| R-03 | service_role nunca en la app | ✅ | Solo en `supabase/functions/delete-account/index.ts:47`; `.env` sin claves secretas e ignorado por git | — | — |
| R-04 | Voz/cámara/2.º plano en development build; degradar en Expo Go | 🟡 | `src/lib/livekit.ts`, `livekit.web.ts`; avisos en `useVoiceRoom.ts:80` | Probar en Expo Go | 4 |
| R-05 | Políticas de tiendas: textos de permisos y justificación previa | 🟡 | Textos en `app.json:18,59-89` | Explicación propia antes de pedir la ubicación (ver OTR-01) | 1 |
| R-06 | Retos por llegada, nunca velocidad máxima | 🟡 | Retos: `src/lib/challenge-db.ts` (clasificación por llegada) | Récords por tramo clasifican por velocidad máxima (`app/records.tsx`, `src/lib/highway-records.ts:196`) → D-05 | 3 |
| R-07 | Español, negro OLED con naranja | ✅ | `src/theme/index.ts`; D-02 | — | — |
| R-08 | Batería y datos moderados | ❓ | `src/lib/tracking.ts:16-41` (15 s/25 m en reposo, 3 s/8 m en party) | Medir en dispositivo (perfil de batería de Android) | — |

### Interfaces de usuario (3.1.1)

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| UI-01 | OLED + naranja; Inter, Space Grotesk, Barlow Condensed en tokens | ✅ | `src/theme/index.ts` (colors, fonts); carga en `app/_layout.tsx` | — | — |
| UI-02 | Pestañas Inicio, Actividad, Party, Retos, Garaje, Perfil | ❌ | `app/(tabs)/_layout.tsx`: Inicio, Party, Retos, Garaje, **Consumo**, Perfil | Actividad como pestaña; Consumo pasa a pantalla accesible desde Garaje | 5 |
| UI-03 | Pantallas listadas | ✅ | `app/`: welcome, sign-up, sign-in, (tabs)/index, actividad, post/new, friends, party, challenges, garage, fuel, profile, scan, drive, party/[code], challenge/[code], u/[username], v/[slug], v/[slug]/sale (3D ⏭ D-01) | — | — |
| UI-04 | Modo conducción grande, vertical y horizontal | 🟡 | `app/drive.tsx:85` detecta horizontal | `app.json:6` fija `"orientation": "portrait"` → nunca gira | 3 |
| UI-05 | Mensajes en español claro | ✅ | `src/i18n` (español base), `src/lib/alerts.ts` | — | — |
| UI-06 | Eliminar cuenta escribiendo exactamente ELIMINAR | 🟡 | `app/account/delete.tsx:42` | Acepta «eliminar» o con espacios (`trim().toUpperCase()`); debe ser exacto | 1 |

### Interfaces de hardware (3.1.2)

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| HW-01 | GPS 1.er/2.º plano con servicio en primer plano | ✅ | `src/lib/tracking.ts:16-41,123-125` (`foregroundService`) | — | — |
| HW-02 | Cámara QR y fotos | ✅ | `app/scan.tsx:23`, `src/hooks/useGarage.ts:117` | — | — |
| HW-03 | Micrófono/altavoz PTT (LiveKit) | ⛔ | `src/hooks/useVoiceRoom.ts` | Secretos LiveKit sin configurar | — |
| HW-04 | Háptica en PTT y acciones clave | ✅ | `app/(tabs)/party.tsx:406,415`, `PartyInviteBanner.tsx` | — | — |
| HW-05 | Preparado para CarPlay/Android Auto | ✅ | `docs/07-carplay-android-auto.md` (fuera de alcance nativo) | — | — |

### Interfaces de software (3.1.3)

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| SW-01 | Sesión JWT en almacenamiento seguro | ❌ | `src/lib/supabase.ts:15` usa `AsyncStorage` | Adaptador cifrado con clave en `expo-secure-store` | 1 |
| SW-02 | PostgreSQL + RLS en todas las entidades | ✅ | migraciones; 32/32 tablas con RLS | — | — |
| SW-03 | Realtime en convoy, chat, retos y feed | 🟡 | Canales en `useParty.ts`, `useChallenges.ts`, `useComments.ts`, `usePartyInvites.ts` | El feed (`useFeed.ts`) no escucha cambios | 3 |
| SW-04 | Buckets avatars, vehicles, posts, receipts | ✅ | migraciones (`storage.buckets`) | — | — |
| SW-05 | Edge Functions livekit-token y borrado con JWT | ✅ | `supabase/functions/*/index.ts` (`getUser` con el JWT) | — | — |
| SW-06 | 3 canales Convoy, Ruta, Charla con token firmado | ✅ | `src/lib/party.ts:17-34`, `livekit-token/index.ts:61,101` | — | — |
| SW-07 | MapLibre GL 3D con edificios y relieve | ⏭ | D-01 | — | — |
| SW-08 | GraphHopper → OSRM → línea directa | 🟡 | `src/lib/graphhopper.ts:230-262` | Falta el 3.er escalón: hoy lanza error en vez de línea directa con aviso | 2 |
| SW-09 | Photon tolerante a faltas | ✅ | `src/lib/place-search.ts` (Photon + respaldo Nominatim + búsqueda difusa) | — | — |
| SW-10 | notifications, print, sharing | ✅ | `src/lib/background-alerts.ts`, `src/lib/pdf.ts` | — | — |

### Interfaces de comunicación (3.1.4)

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| COM-01 | HTTPS en todo, sin `http://` | ✅ | ningún `http://` en `app/` ni `src/` | — | — |
| COM-02 | WSS; posiciones cada 3 s | ✅ | `src/lib/convoy.ts:23` (`LIVE_MOVING_MS = 3_000`), `tracking.ts:37`; D-07 | — | — |
| COM-03 | WebRTC con TURN de LiveKit | ⛔ | `src/lib/livekit.ts` | Secretos LiveKit | — |
| COM-04 | `caravana://` y enlaces web de invitación | 🟡 | `app.json:8` (`scheme`), `src/lib/qr.ts` | La página pública (GitHub Pages) está pendiente de publicar (paso manual) | — |
| COM-05 | QR solo con URL pública | ✅ | `src/lib/qr.ts:3,7` | — | — |

### Requisitos funcionales

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| RF-01 | Registro, login, demo | 🟡 | `app/(auth)/sign-up.tsx:22-85` (correo, contraseña ≥ 8, nombre, @usuario; el formulario conserva los datos), `src/store/auth.ts:179,212` | D-06 (producción sin env) | — |
| RF-02 | Perfil y privacidad | ✅ | `app/profile/edit.tsx`, `app/u/[username].tsx:282,338` (tarjeta mínima) | — | — |
| RF-03 | Eliminación de cuenta | 🟡 | `app/account/delete.tsx`, `supabase/functions/delete-account/index.ts` | (a) ELIMINAR exacto (UI-06); (b) no borra el bucket `receipts`; (c) borra archivos **antes** de borrar el usuario: si falla Auth, ya se perdieron archivos (el SRS pide «no se borra nada») | 1 |
| RF-04 | Amigos | 🟡 | `src/hooks/useFriends.ts:135,194`; BD `friendships_no_self`, `friendships_unique_pair` | Validación en cliente de «a uno mismo» antes de insertar | 2 |
| RF-05 | Feed | 🟡 | `src/hooks/useFeed.ts:255-330` (si la foto falla, borra el post y avisa) | Realtime del feed (SW-03) | 3 |
| RF-06 | Garaje multi-vehículo | ✅ | `app/vehicle/new.tsx:116` (año 1900–2100), `useGarage.ts:117-118` (4:3), bucket `vehicles`, slug + QR | — | — |
| RF-07 | QR de identidad y perfil público | ✅ | `src/components/QRCard.tsx`, `app/v/[slug].tsx`, `app/u/[username].tsx` | — | — |
| RF-08 | Escáner QR | ✅ | `app/scan.tsx:23-122` (permiso, alternativa web, validación de enlace Caravana) | — | — |
| RF-09 | Combustible y energía | 🟡 | `src/lib/fuel.ts:27-131`, `app/vehicle/fuel/new.tsx:99-111` (odómetro y negativos), `src/lib/pdf.ts` | Falta: campo **fecha**, **galones**, **MPG** del historial real, **edición** de registros | 2–3 |
| RF-10 | Mantenimiento y ficha de venta | ✅ | `app/vehicle/maintenance/new.tsx`, `app/v/[slug]/sale.tsx`, `src/lib/pdf.ts` («Sin mantenimientos registrados.») | — | — |
| RF-11 | Mapa y navegación | 🟡 | Búsqueda Photon, ruta completa antes de iniciar (`fitRoute`), paradas, recentrar, recientes, compartir; demo en Santo Domingo (`useLiveLocation.ts:20`) | Sin motor de rutas → ruta directa con aviso (SW-08). 3D ⏭ | 2 |
| RF-12 | Party / convoy | ✅ | `src/lib/live-share.ts` (también en segundo plano), `set_party_destination`, `src/store/follow.ts`, chat, código de 6 (`init_caravana.sql:353`), refetch 15 s | — | — |
| RF-13 | PTT | ⛔ | `PTTButton.tsx:97-98` (pulsar/soltar), `useVoiceRoom.ts:171` | Secretos LiveKit y prueba en dispositivo | — |
| RF-14 | Retos A → B | ✅ | `src/hooks/useChallenges.ts`, `report_challenge_progress`, avisos de conducción responsable | — | — |
| RF-15 | Modo conducción | 🟡 | `app/drive.tsx` | Orientación horizontal bloqueada (UI-04) | 3 |
| RF-16 | Viajes y récords | 🟡 | `src/store/trips.ts:78,364` (descarta precisión > 50 m), viajes en el dispositivo, `app/records.tsx:99` (top 3) | Clasificación por velocidad máxima → D-05 | 3 |
| RF-17 | Eventos con ruta | 🟡 | `app/event/new.tsx:26,136` (máx. 5 puntos), `src/lib/event-routes.ts` (OSRM) | **No hay campo de fecha** ni validación de fecha pasada | 2 |
| RF-18 | Coche aparcado y notificaciones | ✅ | `src/lib/parking-logic.ts`, modo caminando en `WorldMap`, `src/lib/background-alerts.ts:155,186` (sin permiso solo avisos en la app) | — | — |

### Requisitos no funcionales

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| RNF-01 | Primera pantalla < 3 s | ❓ | splash en `app/_layout.tsx` | Medir: `adb shell am start -W` (TotalTime) en gama media | — |
| RNF-02 | Posición < 5 s (p95) | ❓ | envío cada 3 s + Realtime | Medir con dos dispositivos (marca de tiempo `last_seen_at` vs recepción) | — |
| RNF-03 | PTT < 500 ms | ⛔ | — | Requiere LiveKit configurado | — |
| RNF-04 | Ruta urbana < 3 s | 🟡 | `fetchWithTimeout` en `graphhopper.ts:130,211` | Ajustar los tiempos de espera por proveedor para que la cadena completa no pase de ~3 s | 4 |
| RNF-05 | Party de hasta 10 (5 en el plan gratuito), límite en BD | ❌ | `20261031120000_…sql:171-173` pone `max_members` = 50 | Migración nueva: 5 por defecto, máximo 10, `check` en BD | 1 |
| RNF-06 | ≤ 8 % batería/h | ❓ | `tracking.ts` | Medir con Battery Historian | — |
| RNF-07 | RLS en todas las tablas | ✅ | 32/32 | — | — |
| RNF-08 | TLS/WSS y sesión segura | ❌ | ver SW-01 | Adaptador seguro | 1 |
| RNF-09 | service_role solo en Edge Functions | ✅ | R-03 | — | — |
| RNF-10 | Ubicación solo dentro de party activa; QR sin datos | ❌ | `src/lib/live-share.ts:90` (`friend_locations`) | Desactivar compartir con amigos fuera de la party (D-04) | 1 |
| RNF-11 | Token LiveKit solo a miembros y con caducidad | ✅ | `livekit-token/index.ts:90` (membresía), `:121` (`ttl: '2h'`) | — | — |
| RNF-12 | Borrado irreversible de todo | 🟡 | ver RF-03 | Bucket `receipts` | 1 |
| RNF-13 | Reconexión sin perder chat ni ruta | ✅ | chat y destino en BD; `refetchInterval` 15 s (`useParty.ts:195`); Realtime se reconecta | — | — |
| RNF-14 | Respaldo de rutas sin bloquear | 🟡 | ver SW-08 | Línea directa | 2 |
| RNF-15 | Cierres < 1 % | 🟡 | `src/components/AppErrorBoundary.tsx` | Captura de promesas rechazadas sin manejar y registro de errores | 4 |
| RNF-16 | Backend 99,5 % | ❓ | SLA de Supabase; reintentos de React Query | — | — |
| RNF-17 | Demo, garaje local y viajes sin conexión | ✅ | `src/lib/demo.ts`, `src/store/trips.ts` (AsyncStorage) | — | — |
| RNF-18 | tsc, ESLint y Jest en CI | ✅ | `.github/workflows/quality.yml` | — | — |
| RNF-19 | Migraciones versionadas | ✅ | `supabase/migrations/` | — | — |
| RNF-20 | Marca en un único archivo | 🟡 | colores en `src/theme/index.ts` | Nombre, enlaces y textos de marca repartidos | 5 |
| RNF-21 | Revisión semanal de errores | ❌ | — | No hay captura de errores: se añade un registro local y se recomienda Sentry (cuenta del propietario) | 4 |
| RNF-22 | Android, iOS y web | ✅ | CI hace `expo export --platform web` | — | — |
| RNF-23 | Nativo limitado a módulos de Expo | ✅ | `modules/motion` es un Expo Module (API `expo-modules-core`) | — | — |
| RNF-24 | Proveedores por variables de entorno | 🟡 | GraphHopper y Mapbox por `EXPO_PUBLIC_*` | OSRM fijo en `graphhopper.ts:175` y `event-routes.ts:28`; Photon fijo | 4 |

### Otros requisitos (3.4)

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| OTR-01 | Ley 172-13: política enlazada en la app y consentimiento para la ubicación | ❌ | `docs/politica-privacidad-borrador.md` existe | No hay enlace en la app ni pantalla de consentimiento antes de pedir la ubicación (`useLiveLocation.ts:157`) | 1 |
| OTR-02 | Seguridad vial | 🟡 | avisos en retos | Récords por velocidad (D-05) | 3 |
| OTR-03 | Español; DOP/USD/EUR/MXN; métrico e imperial | 🟡 | `src/i18n/index.ts` | Limitar monedas (D-03); idioma (D-02) | 5 |
| OTR-04 | Sin «Wheelz» en la app | ✅ | búsqueda sin resultados en `movil/` | — | — |

### Usuarios (2.3) y suposiciones (2.5)

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| USR | Conductor, host, visitante sin cuenta, demo | ✅ | rutas públicas fuera de `Stack.Protected` (`app/_layout.tsx`), `src/lib/demo.ts` |
| SUP-1 | Secretos LiveKit en Supabase | ⛔ | Paso manual del propietario |
| SUP-2 | Migración de eventos en el repo | ✅ | `supabase/migrations/20261027120000_events.sql` |

## Resumen de la fase 1

| Estado | Nº |
|---|---|
| ✅ CUMPLE | 39 |
| 🟡 PARCIAL | 22 |
| ❌ NO CUMPLE | 7 |
| ⛔ BLOQUEADO | 5 |
| ❓ NO VERIFICABLE | 6 |
| ⏭ OMITIDO | 1 |

## Plan de corrección (fase 2)

1. **Seguridad y legal**
   - RNF-05: migración que deja la party en 5 por defecto y 10 como máximo, con `check` en BD.
   - SW-01/RNF-08: sesión en almacenamiento seguro (clave AES en SecureStore y datos cifrados en AsyncStorage).
   - RF-03/UI-06/RNF-12: ELIMINAR exacto; borrar `receipts`; borrar primero el usuario de Auth y después los archivos.
   - RNF-10: desactivar «ubicación para amigos» fuera de la party.
   - OTR-01: enlace a la política de privacidad y pantalla de consentimiento antes del permiso de ubicación.
2. **Validaciones**
   - RF-04: impedir en el cliente la solicitud a uno mismo.
   - RF-17: campo de fecha y validación de fecha pasada.
   - RF-09: fecha y galones en el registro.
   - SW-08/RNF-14/RF-11: línea directa con aviso.
3. **Funcionales**
   - RF-09: MPG en estadísticas y edición de registros.
   - RF-05/SW-03: Realtime en el feed.
   - RF-15/UI-04: orientación libre.
   - RF-16/D-05: récords por tiempo respetando el límite.
4. **Fiabilidad y mantenibilidad**
   - RNF-15/21: captura de errores globales.
   - RNF-24: OSRM y Photon por variable de entorno.
   - RNF-04: tiempos de espera.
5. **UI y marca**
   - UI-02: pestaña Actividad en lugar de Consumo.
   - RNF-20: archivo de marca.
   - OTR-03: monedas y D-02.

## Progreso

- 02/11/2026 04:40 — Fase 1 terminada. El propietario autoriza seguir con las fases 2 a 4 sin esperar confirmación.
