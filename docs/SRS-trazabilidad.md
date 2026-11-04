# Trazabilidad del SRS — Caravana (IEEE 830, rev. 1.0, 02/11/2026)

Fuente de verdad: `docs/SRS-Caravana-IEEE830.docx`. Auditoría del código en `movil/` (app Expo) y
`movil/supabase/` (migraciones y Edge Functions).

Estados: ✅ CUMPLE · 🟡 PARCIAL · ❌ NO CUMPLE · ⛔ BLOQUEADO · ❓ NO VERIFICABLE EN CÓDIGO · ⏭ OMITIDO (decisión del propietario)

## Decisiones de interpretación

- **D-01 Mapa 3D omitido.** Por indicación del propietario (02/11/2026) no se audita ni se cambia el mapa 3D:
  SW-07 (MapLibre con edificios y relieve) y la parte «3D / vista 2D-3D» de RF-11 y UI-03 quedan ⏭.
  El mapa actual usa `@rnmapbox/maps` con estilos Mapbox; no se migra a MapLibre.
- **D-02 Idioma.** El SRS pide la interfaz «primero en español» (R-07) y «en español» (OTR-03). El español es el
  texto base del código y el idioma por defecto. El inglés es un idioma adicional que se puede elegir en Perfil. Para
  no contradecir OTR-03, el modo automático solo pasa a inglés si el teléfono está en inglés; cualquier otro idioma usa
  español.
- **D-03 Monedas.** OTR-03 limita las monedas a DOP (por defecto), USD, EUR y MXN: la moneda del teléfono solo se
  usa si es una de esas cuatro; si no, DOP.
- **D-04 Ubicación con amigos fuera de la party.** RNF-10 dice que la ubicación solo se comparte dentro de una party
  activa. La función opcional «Mi ubicación para amigos» (tabla `friend_locations`) lo contradice: manda el SRS y
  se desactiva (no se borra el código ni la tabla).
  **Actualización 2026-11-02:** el dueño pide que los amigos aparezcan en el mapa sin estar en una party. Se
  reactiva (`SHARE_OUTSIDE_PARTY = true`), solo si cada uno lo activa y solo entre amigos (RLS de
  `friend_locations`). Esta decisión sustituye a RNF-10 en ese punto.
- **D-05 Récords por tramo.** RF-16 pide «top 3 del tramo y mejor marca propia», pero R-06 y OTR-02 prohíben premiar
  la velocidad. Se mantiene el top 3 y la marca propia, pero **solo cuentan las pasadas que no superan el límite del
  tramo**: las que lo superan no se envían ni se muestran. Así nadie gana por ir más rápido de lo permitido. ❓ AMBIGUO:
  si el docente prefiere otra métrica (p. ej. regularidad), cambia solo `src/lib/record-rules.ts`.
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
| R-05 | Políticas de tiendas: textos de permisos y justificación previa | ✅ | Textos en `app.json`; aviso propio antes del permiso: `src/lib/location-consent.ts` (usado en `useLiveLocation.ts` y `tracking.ts`) | — | — |
| R-06 | Retos por llegada, nunca velocidad máxima | ✅ | Retos: `src/lib/challenge-db.ts`; récords solo con pasadas dentro del límite: `src/lib/record-rules.ts` (D-05) | — | — |
| R-07 | Español, negro OLED con naranja | ✅ | `src/theme/index.ts`; D-02 | — | — |
| R-08 | Batería y datos moderados | ❓ | `src/lib/tracking.ts:16-41` (15 s/25 m en reposo, 3 s/8 m en party) | Medir en dispositivo (perfil de batería de Android) | — |

### Interfaces de usuario (3.1.1)

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| UI-01 | OLED + naranja; Inter, Space Grotesk, Barlow Condensed en tokens | ✅ | `src/theme/index.ts` (colors, fonts); carga en `app/_layout.tsx` | — | — |
| UI-02 | Pestañas Inicio, Actividad, Party, Retos, Garaje, Perfil | ✅ | `app/(tabs)/_layout.tsx`; `app/(tabs)/actividad.tsx`; Consumo oculto como pestaña (`href: null`) y accesible desde Garaje | — | — |
| UI-03 | Pantallas listadas | ✅ | `app/`: welcome, sign-up, sign-in, (tabs)/index, actividad, post/new, friends, party, challenges, garage, fuel, profile, scan, drive, party/[code], challenge/[code], u/[username], v/[slug], v/[slug]/sale (3D ⏭ D-01) | — | — |
| UI-04 | Modo conducción grande, vertical y horizontal | ✅ | `src/hooks/useFreeOrientation.ts` en `app/drive.tsx` y al navegar en `app/(tabs)/index.tsx`; `app.json` `"orientation": "default"` con bloqueo vertical en `app/_layout.tsx` | Probar en dispositivo | — |
| UI-05 | Mensajes en español claro | ✅ | `src/i18n` (español base), `src/lib/alerts.ts` | — | — |
| UI-06 | Eliminar cuenta escribiendo exactamente ELIMINAR | ✅ | `src/lib/delete-account.ts` (`isDeleteConfirmed`), `app/account/delete.tsx`; prueba en `srs-backend.test.ts` | — | — |

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
| SW-01 | Sesión JWT en almacenamiento seguro | ✅ | `src/lib/secure-session-storage.ts` (SecureStore en trozos; migra la sesión de AsyncStorage) usado en `src/lib/supabase.ts`; prueba `secure-session-storage.test.ts` | — | — |
| SW-02 | PostgreSQL + RLS en todas las entidades | ✅ | migraciones; 32/32 tablas con RLS | — | — |
| SW-03 | Realtime en convoy, chat, retos y feed | ✅ | Canales en `useParty.ts`, `useChallenges.ts`, `useComments.ts`, `usePartyInvites.ts` y `useFeed.ts` (posts, likes, comentarios) | — | — |
| SW-04 | Buckets avatars, vehicles, posts, receipts | ✅ | `vehicles` y `posts` en migraciones previas; `avatars` y `receipts` con políticas en `20261102061000_avatars_receipts_buckets.sql` | Aplicar la migración | — |
| SW-05 | Edge Functions livekit-token y borrado con JWT | ✅ | `supabase/functions/*/index.ts` (`getUser` con el JWT) | — | — |
| SW-06 | 3 canales Convoy, Ruta, Charla con token firmado | ✅ | `src/lib/party.ts:17-34`, `livekit-token/index.ts:61,101` | — | — |
| SW-07 | MapLibre GL 3D con edificios y relieve | ⏭ | D-01 | — | — |
| SW-08 | GraphHopper → OSRM → línea directa | ✅ | `src/lib/graphhopper.ts` (`fetchStreetRoutes` devuelve `source: fallback`), aviso en `DestinationCard`; prueba `route-fallback.test.ts` | — | — |
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
| RF-03 | Eliminación de cuenta | ✅ | `supabase/functions/delete-account/index.ts`: borra primero el usuario de Auth (si falla, no se toca nada) y luego los archivos de posts, vehicles, avatars y receipts con reintentos; ELIMINAR exacto | Desplegar la función | — |
| RF-04 | Amigos | ✅ | `src/hooks/useFriends.ts` (rechaza solicitud a uno mismo y duplicados); BD `friendships_no_self`, `friendships_unique_pair` | — | — |
| RF-05 | Feed | ✅ | `src/hooks/useFeed.ts` (si la foto falla, borra el post y avisa; Realtime con RLS) | — | — |
| RF-06 | Garaje multi-vehículo | ✅ | `app/vehicle/new.tsx:116` (año 1900–2100), `useGarage.ts:117-118` (4:3), bucket `vehicles`, slug + QR | — | — |
| RF-07 | QR de identidad y perfil público | ✅ | `src/components/QRCard.tsx`, `app/v/[slug].tsx`, `app/u/[username].tsx` | — | — |
| RF-08 | Escáner QR | ✅ | `app/scan.tsx:23-122` (permiso, alternativa web, validación de enlace Caravana) | — | — |
| RF-09 | Combustible y energía | ✅ | `app/vehicle/fuel/new.tsx` (fecha, L o galones, edición con `logId`), `src/lib/fuel-entry.ts` (validaciones), `src/lib/fuel.ts` (`efficiencyEquivalents`: km/L, L/100 km, MPG), `FuelSummaryCard`, `src/lib/pdf.ts`; prueba `fuel-entry.test.ts` | — | — |
| RF-10 | Mantenimiento y ficha de venta | ✅ | `app/vehicle/maintenance/new.tsx`, `app/v/[slug]/sale.tsx`, `src/lib/pdf.ts` («Sin mantenimientos registrados.») | — | — |
| RF-11 | Mapa y navegación | ✅ | Búsqueda Photon, ruta completa antes de iniciar, paradas, recentrar, recientes, compartir; demo en Santo Domingo; línea directa con aviso. 3D ⏭ (D-01) | — | — |
| RF-12 | Party / convoy | ✅ | `src/lib/live-share.ts` (también en segundo plano), `set_party_destination`, `src/store/follow.ts`, chat, código de 6 (`init_caravana.sql:353`), refetch 15 s | — | — |
| RF-13 | PTT | ⛔ | `PTTButton.tsx:97-98` (pulsar/soltar), `useVoiceRoom.ts:171` | Secretos LiveKit y prueba en dispositivo | — |
| RF-14 | Retos A → B | ✅ | `src/hooks/useChallenges.ts`, `report_challenge_progress`, avisos de conducción responsable | — | — |
| RF-15 | Modo conducción | ✅ | `app/drive.tsx` (demo) y navegación en Inicio, en vertical y horizontal; botones de acceso a la party con PTT y al reto en curso en `NavigationHud` (`onOpenParty`, `onOpenChallenge`) | Probar en dispositivo | — |
| RF-16 | Viajes y récords | ✅ | `src/store/trips.ts` (descarta precisión > 50 m), viajes en el dispositivo, `app/records.tsx` (top 3 y marca propia solo con pasadas dentro del límite, D-05) | — | — |
| RF-17 | Eventos con ruta | ✅ | `app/event/new.tsx` (fecha y hora, máx. 5 puntos), `src/lib/events.ts` (`parseEventStart` rechaza fechas pasadas), `src/lib/event-routes.ts` (OSRM); prueba `event-date.test.ts` | — | — |
| RF-18 | Coche aparcado y notificaciones | ✅ | `src/lib/parking-logic.ts`, modo caminando en `WorldMap`, `src/lib/background-alerts.ts:155,186` (sin permiso solo avisos en la app) | — | — |

### Requisitos no funcionales

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| RNF-01 | Primera pantalla < 3 s | ❓ | splash en `app/_layout.tsx` | Medir: `adb shell am start -W` (TotalTime) en gama media | — |
| RNF-02 | Posición < 5 s (p95) | ❓ | envío cada 3 s + Realtime | Medir con dos dispositivos (marca de tiempo `last_seen_at` vs recepción) | — |
| RNF-03 | PTT < 500 ms | ⛔ | — | Requiere LiveKit configurado | — |
| RNF-04 | Ruta urbana < 3 s | 🟡 | `src/lib/providers.ts`: 3 s para GraphHopper y 4 s para OSRM; luego línea directa | Medir en 4G (en el peor caso, la línea directa aparece a los 7 s) | — |
| RNF-05 | Party de hasta 10 (5 en el plan gratuito), límite en BD | ✅ | `20261102060000_party_member_limit.sql` (`check` 2–10, por defecto 5), `PARTY_FREE_MEMBERS` en el cliente; prueba en `srs-backend.test.ts` | Aplicar la migración | — |
| RNF-06 | ≤ 8 % batería/h | ❓ | `tracking.ts` | Medir con Battery Historian | — |
| RNF-07 | RLS en todas las tablas | ✅ | 32/32 | — | — |
| RNF-08 | TLS/WSS y sesión segura | ✅ | ver SW-01 y COM-01 | — | — |
| RNF-09 | service_role solo en Edge Functions | ✅ | R-03 | — | — |
| RNF-10 | Ubicación solo dentro de party activa; QR sin datos | ⚠️ D-04 | Cambiado por decisión del dueño: amigos en el mapa si lo activan (`SHARE_OUTSIDE_PARTY = true`, RLS solo amigos); prueba en `srs-backend.test.ts` | — | — |
| RNF-11 | Token LiveKit solo a miembros y con caducidad | ✅ | `livekit-token/index.ts:90` (membresía), `:121` (`ttl: '2h'`) | — | — |
| RNF-12 | Borrado irreversible de todo | ✅ | ver RF-03 | — | — |
| RNF-13 | Reconexión sin perder chat ni ruta | ✅ | chat y destino en BD; `refetchInterval` 15 s (`useParty.ts:195`); Realtime se reconecta | — | — |
| RNF-14 | Respaldo de rutas sin bloquear | ✅ | ver SW-08; se reintenta la ruta por calles cada 15 s | — | — |
| RNF-15 | Cierres < 1 % | 🟡 | `AppErrorBoundary` + `src/lib/error-log.ts` (errores globales y promesas sin manejar) | Medir la tasa con un servicio de errores (p. ej. Sentry) | — |
| RNF-16 | Backend 99,5 % | ❓ | SLA de Supabase; reintentos de React Query | — | — |
| RNF-17 | Demo, garaje local y viajes sin conexión | ✅ | `src/lib/demo.ts`, `src/store/trips.ts` (AsyncStorage) | — | — |
| RNF-18 | tsc, ESLint y Jest en CI | ✅ | `.github/workflows/quality.yml` | — | — |
| RNF-19 | Migraciones versionadas | ✅ | `supabase/migrations/` | — | — |
| RNF-20 | Marca en un único archivo | ✅ | `src/brand.ts` (nombre, logotipo, colores, enlaces y correo) usado por el tema, el QR, los logotipos y la política | — | — |
| RNF-21 | Revisión semanal de errores | 🟡 | Registro local de los últimos 50 errores (`src/lib/error-log.ts`) | Proceso: revisarlo cada semana; recomendado conectar Sentry (necesita cuenta del propietario) | — |
| RNF-22 | Android, iOS y web | ✅ | CI hace `expo export --platform web` | — | — |
| RNF-23 | Nativo limitado a módulos de Expo | ✅ | `modules/motion` es un Expo Module (API `expo-modules-core`) | — | — |
| RNF-24 | Proveedores por variables de entorno | ✅ | `src/lib/providers.ts` (`EXPO_PUBLIC_OSRM_URL`, `EXPO_PUBLIC_PHOTON_URL`, `EXPO_PUBLIC_NOMINATIM_URL`), GraphHopper y Mapbox por `EXPO_PUBLIC_*`; `.env.example` | — | — |

### Otros requisitos (3.4)

| ID | Requisito | Estado | Evidencia | Qué falta | Prio |
|---|---|---|---|---|---|
| OTR-01 | Ley 172-13: política enlazada en la app y consentimiento para la ubicación | 🟡 | `app/privacidad.tsx` (sin cuenta), enlaces en Bienvenida, Registro y Perfil; consentimiento en `src/lib/location-consent.ts` | Revisión legal del texto y publicarlo en una URL HTTPS para las tiendas | — |
| OTR-02 | Seguridad vial | ✅ | avisos en retos; récords limitados al límite de velocidad (D-05) | — | — |
| OTR-03 | Español; DOP/USD/EUR/MXN; métrico e imperial | ✅ | `src/i18n/index.ts` (`resolveCurrency`, `resolveLanguage`, km/mi) | — | — |
| OTR-04 | Sin «Wheelz» en la app | ✅ | búsqueda sin resultados en `movil/` | — | — |

### Usuarios (2.3) y suposiciones (2.5)

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| USR | Conductor, host, visitante sin cuenta, demo | ✅ | rutas públicas fuera de `Stack.Protected` (`app/_layout.tsx`), `src/lib/demo.ts` |
| SUP-1 | Secretos LiveKit en Supabase | ✅ | Configurados el 02/11/2026 (`livekit-token` ya no responde «no está configurado») |
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

## Resumen final (fase 4)

| Estado | Fase 1 | Final |
|---|---|---|
| ✅ CUMPLE | 40 | 65 |
| 🟡 PARCIAL | 25 | 7 |
| ❌ NO CUMPLE | 7 | 0 |
| ⛔ BLOQUEADO | 5 | 5 |
| ❓ NO VERIFICABLE | 5 | 5 |
| ⏭ OMITIDO | 1 | 1 |

(Conteo automático de las filas de la matriz; corrige el conteo manual de la fase 1.)

Verificación (02/11/2026):
- `npx tsc --noEmit`, `npx eslint .` y `npx jest` en verde (31 suites, 192 pruebas).
- `npx expo-doctor` 20/20 y `npx expo export --platform web` correctos.
- El workflow `.github/workflows/quality.yml` corre lo mismo en cada push a `main` y en cada PR.
- Sin `service_role` ni secretos en `app/`, `src/`, `app.json` ni `.env*`: lo comprueba `src/__tests__/srs-backend.test.ts`.
- Las 32 tablas tienen RLS: también lo comprueba esa prueba.

### Pasos manuales del propietario

1. **Aplicar las migraciones nuevas** en Supabase (`supabase db push` o el SQL Editor), en este orden:
   - `20261102060000_party_member_limit.sql` (RNF-05): reduce a 5 miembros las parties abiertas.
   - `20261102061000_avatars_receipts_buckets.sql` (SW-04).
2. **Volver a desplegar la Edge Function** `delete-account` (RF-03): `supabase functions deploy delete-account`.
3. **LiveKit** (RF-13, HW-03, COM-03, RNF-03): crear los secretos con
   `supabase secrets set LIVEKIT_URL=… LIVEKIT_API_KEY=… LIVEKIT_API_SECRET=…`, desplegar `livekit-token` y probar el PTT
   con dos teléfonos.
4. **Página de invitación** (COM-04): publicar la carpeta de GitHub Pages con el script `publicar-invitacion.sh`.
5. **Política de privacidad** (OTR-01): revisión legal y publicación en una URL HTTPS para las fichas de las tiendas.
6. **Mediciones en dispositivo** (❓):
   - RNF-01: `adb shell am start -W app.caravana.mobile/.MainActivity` → TotalTime < 3000 ms.
   - RNF-02: dos teléfonos en la misma party; comparar `last_seen_at` con el momento en que se ve el cambio.
   - RNF-06 y R-08: Battery Historian durante una hora de tracking.
   - RNF-16: SLA de Supabase.
   - RNF-04: tiempo de ruta en 4G.
7. **Errores** (RNF-21): revisar cada semana el registro local o conectar Sentry con una cuenta propia.
8. **Pruebas en el teléfono** de lo nuevo:
   - giro a horizontal en el modo conducción;
   - consentimiento de ubicación la primera vez;
   - edición de repostajes;
   - pestaña Actividad.

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
- 02/11/2026 — Fase 3. Commits, uno por requisito o grupo:
  - RNF-05.
  - SW-01 y RNF-08.
  - RF-03, RNF-12, UI-06 y SW-04.
  - RNF-10.
  - OTR-01 y R-05.
  - SW-08, RNF-14, RF-11 y RF-04.
  - RF-17.
  - RF-09.
  - UI-04 y RF-15.
  - RF-05 y SW-03.
  - RF-16, R-06 y OTR-02.
  - RNF-24, RNF-04, RNF-15 y RNF-21.
  - UI-02, RNF-20 y OTR-03.
- 02/11/2026 — Fase 4: verificación completa (ver «Resumen final»).
- 02/11/2026 — Ya en producción:
  - migraciones `20261102060000` y `20261102061000` aplicadas desde el SQL Editor (el bucket `avatars` existe);
  - secretos de LiveKit configurados.
  - Pendiente: volver a desplegar `delete-account` con la CLI y probar el PTT con dos teléfonos.


---

## Enmienda 1.1 — Alta prioridad (auditoría, 2026-11-02)

Fase 1: auditoría sin cambios de código. Estado: ✅ cumple con evidencia · 🟡 parcial · ❌ no existe · ⛔ bloqueado (necesita una decisión o un paso del dueño).
Base: rama `refactor/gps-auditoria` @ `8fc353f`.

### Decisiones de interpretación
- **I-01** «Apodo» = `@usuario`. El pedido dice de 3 a 20 caracteres con `.`; hoy son de 3 a 24 sin `.`. Se adopta la regla nueva y los usuarios existentes que no la cumplan se conservan (sin renombrarlos a la fuerza).
- **I-02** Amigos en el mapa (MAPA-20) contra CONV-09 / RNF-10: se aplican las dos. Con amigos, solo si el usuario lo activa y con modo fantasma. Dentro del convoy, solo mientras es miembro. Ya está anotado como D-04.
- **I-03** «Cada 5 s» (SYNC-03): tiempo real primero y sondeo de 5 s solo en las pantallas enfocadas con datos que cambian. En segundo plano no se sondea (RNF-06).
- **I-04** Voz «manos libres» (CONV-14): micrófono abierto con detección de voz, desactivado por defecto y activable desde el panel de voz.
- **I-05** Escribir con el coche en marcha (CONV-12): bloqueado por encima de 10 km/h, salvo que el usuario confirme que es pasajero (versión segura más cercana; Waze hace lo mismo).

### 1. Registro con vehículo
| ID | Estado | Evidencia / qué falta |
|---|---|---|
| REG-01 | ❌ | `app/(auth)/sign-up.tsx` es una sola pantalla con Nombre, Usuario, Correo y Contraseña. Faltan **Apellido**, el campo «Apodo» con ese nombre y el paso 1 separado. |
| REG-02 | 🟡 | Patrón `^[a-z0-9_]{3,24}$` (`sign-up.tsx:21`) y `unique` en la BD (`init_caravana.sql:110`). No hay comprobación en vivo de disponibilidad, ni `.`, ni límite de 20. La unicidad ya es sin mayúsculas porque todo se pasa a minúsculas. |
| REG-03 | 🟡 | Valida el formato (`sign-up.tsx:22,59`). Que el correo ya exista solo se sabe al enviar, por el error de Supabase. No hay comprobación previa ni vuelta al paso 1. |
| REG-04 | 🟡 | Mínimo 8, confirmación y mostrar/ocultar (`sign-up.tsx:62-66`). No exige letra y número ni tiene medidor de fortaleza. |
| REG-05 | ❌ | El registro no pide vehículo. `app/vehicle/new.tsx` existe aparte (garaje), con tipos y marcas; hay que verificar el rango de año y el autocompletado. |
| REG-06 | 🟡 | `expo-image-picker` está y el bucket `vehicles` existe (migración `…061000`). No está en el registro; falta comprobar el recorte 4:3, la compresión y el reintento sin perder el vehículo. |
| REG-07 | ❌ | El trigger `handle_new_user` crea el perfil (`init_caravana.sql:143`), pero sin `first_name` ni `last_name` y sin vehículo. Falta una RPC transaccional para perfil y vehículo principal (slug y QR). |
| REG-08 | ❌ | No hay borrador local del registro. |
| REG-09 | 🟡 | Teclado y autocompletado correctos por campo. Faltan el indicador 1/3, los pasos y el foco automático con «Siguiente». |
| REG-10 | ✅ | Errores junto a cada campo (`sign-up.tsx` `error={errors.*}`). |
| REG-11 | 🟡 | Pantalla «Revisa tu correo» (`sign-up.tsx:95`). Falta el botón **Reenviar**. |
| REG-12 | 🟡 | El modo demo funciona. Falta el aviso a usuarios antiguos sin vehículo. |
| REG-13 | ❌ | No hay pruebas de validadores del registro. |

### 2. Mapa y navegación
| ID | Estado | Evidencia / qué falta |
|---|---|---|
| MAPA-01 | 🟡 | Mapbox con el estilo de navegación oscuro, edificios (`WorldMap.tsx:86`) y modo de día automático (`useMapTheme`, `daylight.ts`). Falta verificar el cambio 2D/3D y el acento naranja en la ruta. |
| MAPA-02 | ⛔ | Photon/OSM más una lista local (`place-search.ts`, `do-places.ts`, 137 lugares). Benchmark: **≈55-75 % de acierto** (abajo). No llega al 95 % → **propuesta de proveedor, decisión tuya**. |
| MAPA-03 | 🟡 | Abreviaturas, sin tildes y con faltas (`place-search.ts`), orden por cercanía y recientes (`app/destino.tsx:34`). Faltan **favoritos Casa y Trabajo** y medir el debounce. |
| MAPA-04 | ✅ | Capas de tráfico de Mapbox navigation (`WorldMap.tsx:123-140`): solo se pintan las retenciones. |
| MAPA-05 | 🟡 | Primer plano con watch de 1 s (`useLiveLocation.ts`). Segundo plano con DrivingService (FGS) al conducir o en convoy. Falta forzar el FGS **durante una navegación** aunque no se detecte vehículo. iOS sin verificar. |
| MAPA-06 | 🟡 | El puck nativo de Mapbox se anima solo y los amigos se suavizan (`useSmoothMembers`, `interpolatePoint`). **No hay ajuste a la calle (snap-to-road).** Filtro de precisión: 50 m al grabar y 100 m al compartir; el pedido dice 30 m. |
| MAPA-07 | ✅ | `src/lib/nav-camera.ts` usa una curva velocidad→zoom y se acerca a menos de 250 m del giro. |
| MAPA-08 | ✅ | Rumbo arriba con inclinación, y brújula cuando vas parado (`useLiveLocation.ts` `applyCompassHeading`). Botón de norte arriba (`MapControls.tsx:24`). |
| MAPA-09 | ✅ | Arrastrar suspende el seguimiento y aparece «Recentrar» (`MapControls.tsx:37`, `index.tsx` `handleFollowChange`). |
| MAPA-10 | 🟡 | Capas nativas de rnmapbox. `index.tsx` tiene 1.600 líneas y se re-renderiza en cada lectura de GPS. Hay que medirlo con el profiler en el dispositivo. |
| MAPA-11 | ⛔ | Batería: medirla exige un viaje real de 1 h. Lo hago contigo (guion de la sección 5). |
| MAPA-12 | 🟡 | La cadena GraphHopper→OSRM→línea directa existe (`graphhopper.ts`), pero **GraphHopper no está configurado** (`.env` vacío), así que se usa el **OSRM público de demostración**, sin tráfico y con límite de uso. → **Propuesta de motor, decisión tuya.** |
| MAPA-13 | ✅ | Hasta 3 alternativas antes de salir (`graphhopper.ts:194`, `index.tsx:674,960`). |
| MAPA-14 | ✅ | HUD con la maniobra, la siguiente, la calle, ETA, hora de llegada y distancia (`NavigationHud.tsx`, `index.tsx:386-420`). |
| MAPA-15 | 🟡 | Voz en español con avisos a 800 m (solo en vías rápidas), 300 m y en el giro, y botón de silenciar (`useVoiceGuidance.ts:12`, `index.tsx:231`). Pedido: 500 m, 200 m y «ahora». |
| MAPA-16 | 🟡 | Recalcula solo, pero el umbral es **80 m** (`index.tsx:406`) y espera 15 s entre recálculos (`index.tsx:913`). Pedido: 40 m sostenidos y ≤ 3 s. |
| MAPA-17 | ✅ | Lo recorrido se oculta (`WorldMap.tsx:430`) y aparece «Has llegado» con fin automático (`index.tsx`). |
| MAPA-18 | ✅ | Paradas en ruta sin perder el destino (`src/lib/stops.ts`, `index.tsx:717`). |
| MAPA-19 | 🟡 | Amigos en el mapa (`useFriendsOnMap.ts`), pero **por sondeo cada 15 s**, no en tiempo real. Sin rumbo ni estado en marcha/parado en el marcador. |
| MAPA-20 | 🟡 | Opt-in con aviso único e interruptor en Perfil, y RLS solo para amigos (`…friend_locations.sql:30-35`). Falta el **modo fantasma en un toque desde el mapa**, la elección de amigos y actualizar la política de privacidad. |
| MAPA-21 | 🟡 | «Visto hace X» (`lastSeenLabel`) y se ocultan por TTL. Falta pintarlos en gris. |
| MAPA-22 | 🟡 | `FriendSheet.tsx` tiene Invitar, Retar, Ver perfil y Seguir. **Seguir solo aparece si es del convoy.** Faltan @apodo, vehículo principal y distancia. |
| MAPA-23 | 🟡 | Seguir existe para miembros del convoy (`useFollow`, la ruta va hacia él cada 150 m). Falta para amigos fuera del convoy y mostrar la ETA hasta él. |
| MAPA-24 | 🟡 | Invitar o crear el convoy con un toque (`index.tsx:567`, `usePartyInvites`), con banner en la app y aviso en segundo plano por sondeo local. **No hay push real** (FCM/APNs) con la app cerrada del todo. |
| MAPA-25 | 🟡 | Agrupación de rnmapbox (`WorldMap.tsx:1234`). Sin prueba de rendimiento con 50 amigos. |
| MAPA-26 | 🟡 | Usa la última posición conocida (`useLiveLocation.ts` `getLastKnownPositionAsync`). Sin medir los 2 s. |
| MAPA-27 | 🟡 | Sin permiso: Santo Domingo y un aviso (`DEMO_LOCATION`). **No hay botón a Ajustes** (`Linking.openSettings` no se usa). |
| MAPA-28 | ❌ | Sin detección de conexión (no hay NetInfo), ni aviso, ni recuperación automática al volver la red. |

### 2.F Benchmark de búsqueda (proveedor actual, desde el PC, sesgo en Santo Domingo)
| Búsqueda | Primer resultado | ¿Correcto? |
|---|---|---|
| Agora Mall | Agora Mall, India | ❌ |
| Blue Mall | Blue Mall, SD | ✅ |
| Sambil Santo Domingo | Plaza Lama Sambil | 🟡 cerca |
| Megacentro | Megacentro, SDE | ✅ |
| Plaza de la Bandera | Plaza de la Bandera, SDO | ✅ |
| Av. Máximo Gómez esq. 27 de Febrero | Av. 27 de Febrero (no el cruce) | ❌ |
| Av. Abraham Lincoln esq. Sarasota | Av. Abraham Lincoln (no el cruce) | ❌ |
| Estadio Quisqueya | Estadio Quisqueya | ✅ |
| Aeropuerto Las Américas | AILA, Boca Chica | ✅ |
| Hospital Plaza de la Salud | Hospital General Plaza de la Salud | ✅ |
| Farmacia Carol Naco | Farmacia Carol (sucursal sin verificar) | 🟡 |
| Supermercado Nacional Churchill | **Bravo** Churchill | ❌ |
| Jumbo Luperón | Jumbo Luperón | ✅ |
| Shell Av. Independencia | Shell (sucursal sin verificar) | 🟡 |
| Texaco Av. Tiradentes | Texaco en SDE | ❌ |
| Banco Popular Av. Winston Churchill | Banco Popular (sucursal sin verificar) | 🟡 |
| Monumento de Santiago | Monumento a los Héroes de la Restauración | ✅ |
| PUCMM Santiago | PUCMM | ✅ |
| Calle El Conde | Calle El Conde | ✅ |
| Malecón de Santo Domingo | Malecón | ✅ |

Resultado: **11/20 exactos (55 %), 15/20 contando los parciales (75 %)**. Los cruces con «esq.» y las sucursales de cadenas son los puntos débiles. Hace falta comparar en el teléfono contra Waze y medir las 10 rutas reales: lo hacemos juntos (guion de la sección 5). La app suma una lista local que puede corregir algún caso (por ejemplo «Sambil»).

### 3. Convoy / Party
| ID | Estado | Evidencia / qué falta |
|---|---|---|
| CONV-01 | 🟡 | Crear, código de 6, enlace, QR e invitar desde el mapa (`useParty.ts`, `qr.ts`, `scan.tsx`). El destino es opcional sin la opción «definir después». La página del enlace está ⛔ hasta que actives Pages. |
| CONV-02 | 🟡 | Destino común con quién y cuándo lo fijó, y aviso (`set_party_destination`, `ConvoyDestinationCard`). **Cualquier miembro** puede cambiarlo; falta el permiso del host. Sin medir los ≤ 2 s. |
| CONV-03 | ✅ | Cada miembro calcula su propia ruta desde su posición hasta el destino común, con toda la navegación (`followDestination`, `index.tsx`). |
| CONV-04 | 🟡 | Posición, rumbo y velocidad cada 3 s, también en segundo plano (`live-share.ts`, `convoy.ts:21`). **No se publican la ETA ni la ruta.** Los demás miembros no ven las rutas de los otros. |
| CONV-05 | 🟡 | Lista de miembros con estado (`memberLiveLabel`) y seguir. **No se ordena por ETA** ni muestra «llega en X min» ni la distancia restante. |
| CONV-06 | ❌ | No hay aviso de llegada de miembros del convoy (solo en retos) ni resumen al cerrar. |
| CONV-07 | 🟡 | Reconexión de Supabase Realtime, sondeo de 15 s y recarga al volver. Los miembros sin señal muestran «HACE X MIN». Desde hoy se ocultan del mapa a los 30 min (CONV-07 pide gris, no ocultar; se ajusta). |
| CONV-08 | 🟡 | Límite de 5/10 en el servidor (`…060000_party_member_limit.sql`). Desde hoy el host pasa el mando al salir. **No hay expulsar** ni «terminar para todos». |
| CONV-09 | ✅ | Solo con `partyId` activo y se borra al salir (`useParty.ts` `left_at`, `last_lat: null`). |
| CONV-10 | 🟡 | Chat con RLS, historial de 120 mensajes y tiempo real (`usePartyMessages`). Faltan el **badge de no leídos** y el avatar en cada mensaje (por verificar). |
| CONV-11 | ❌ | No hay envío optimista ni reintento. Tras reconectar se recarga entero. |
| CONV-12 | ❌ | No hay mensajes rápidos ni bloqueo de escritura en marcha. |
| CONV-13 | 🟡 | La Edge Function `livekit-token` verifica que seas miembro (`functions/livekit-token/index.ts`). ⛔ **LiveKit rechaza la clave (401)**: hay que volver a poner el secret. Falta revisar la caducidad (TTL) del token. |
| CONV-14 | 🟡 | PTT con 3 canales (`PTTButton.tsx`, `useVoiceRoom.ts`). Desde hoy se pide el micrófono. **No hay manos libres** ni vibración (por verificar). |
| CONV-15 | 🟡 | Indicador de quién habla (`activeSpeakerIds`). Faltan silenciar a un miembro y el audio general, bajar la voz de navegación cuando alguien habla, y verificar el audio con la pantalla bloqueada. |
| CONV-16 | ⛔ | La latencia y la reconexión de la sala no se pueden medir hasta arreglar el 401. El aviso claro sin LiveKit existe (`useVoiceRoom.ts`). |

### 4. Retos
| ID | Estado | Evidencia / qué falta |
|---|---|---|
| RETO-01 | 🟡 | Retar desde el convoy (`party.tsx:262-291`), pero **la meta es el destino del convoy**. Falta elegir un destino independiente. |
| RETO-02 | ✅ | «Retar» en la ficha del amigo (`FriendSheet.tsx`) y en la lista del convoy (`party.tsx:345`). |
| RETO-03 | 🟡 | Aceptar y rechazar (`useChallenges.ts:463-470`, `challenge/[code].tsx`). Falta elegir categoría y punto de salida. El aviso con la app cerrada es por sondeo local, sin push. |
| RETO-04 | 🟡 | El host inicia (`useChallenges.ts:494`). **No hay cuenta atrás.** Falta verificar la ruta propia de cada participante y la vuelta a la ruta del convoy. |
| RETO-05 | 🟡 | Llegada verificada en el servidor con puesto atómico (`report_challenge_progress`, `convoy_live.sql`). Hay clasificación por avance (%), no por ETA. Hay que verificar el radio de llegada (`ARRIVE_RADIUS_M`). |
| RETO-06 | ✅ | «Reto por llegada… respetando las leyes» (`party.tsx:274`) y `countsAsRecord` sin velocidad (`record-rules.ts`, prueba `srs-backend.test.ts`). Falta que haya que **aceptar el aviso antes de cada reto**. |
| RETO-07 | ❌ | No existen los estados «abandonó» y «sin conexión». |
| RETO-08 | 🟡 | Resultado e historial en `challenges.tsx`. Falta publicar en el feed. |

### 4-bis. Actualización automática
| ID | Estado | Evidencia / qué falta |
|---|---|---|
| SYNC-01 | 🟡 | Desde hoy (`8fc353f`) los datos se recargan al volver a la app (`focusManager`) y se renueva la sesión. Hay pantallas sin tiempo real ni sondeo: amigos y solicitudes, garaje, perfil. |
| SYNC-02 | 🟡 | Tiempo real en party, chat, retos, invitaciones, feed y comentarios. **Faltan amistades y posiciones de amigos.** |
| SYNC-03 | ❌ | El sondeo es de 15 s en tres consultas; no hay de 5 s. |
| SYNC-04 | 🟡 | `AppState` y `focusManager` ✅ (hoy). **No hay `onlineManager` ni NetInfo.** Los canales se resuscriben con supabase-js; no se ha verificado tras caducar la sesión. |
| SYNC-05 | ❌ | No hay pull-to-refresh (`RefreshControl` no se usa en ningún sitio). |
| SYNC-06 | 🟡 | TanStack conserva los datos al refrescar. Falta verificarlo pantalla por pantalla. |
| SYNC-07 | 🟡 | El sondeo se pausa en segundo plano y se usa `acquireSubscription`. Sin pruebas de fugas de canales. |
| SYNC-08 | ⛔ | `expo-updates` no está instalado. Necesita cuenta EAS → paso tuyo (`eas login`). |
| SYNC-09 | ❌ | No hay indicador de conexión ni «actualizado hace X s». |
| SYNC-10 | ❌ | No hay pruebas de la configuración de consultas ni de la limpieza de suscripciones. |

### Resumen
| Módulo | ✅ | 🟡 | ❌ | ⛔ |
|---|---|---|---|---|
| Registro (13) | 1 | 7 | 5 | 0 |
| Mapa (28) | 8 | 17 | 1 | 2 |
| Convoy (16) | 2 | 10 | 3 | 1 |
| Retos (8) | 2 | 5 | 1 | 0 |
| Sync (10) | 0 | 5 | 4 | 1 |
| **Total (75)** | **13** | **44** | **14** | **4** |


### Avance de la fase 3 (2026-11-03)

Hecho en código y con prueba Jest. Falta la prueba en dispositivos (guion de la sección 5).

| Área | Criterios | Commit | Pruebas |
|---|---|---|---|
| Búsqueda y rutas | MAPA-02 (Google Places por Edge Function `places`, con tope de 300 al día; ⛔ falta tu `GOOGLE_MAPS_API_KEY`), MAPA-12 (Mapbox `driving-traffic`, luego GraphHopper, OSRM y línea directa) | `15cddf7` | `google-places.test.ts`, `route-stops.test.ts` |
| Actualización automática | SYNC-01…05, SYNC-07, SYNC-09 (sondeo de 5 s en la pantalla visible, `focusManager` y `onlineManager` con NetInfo, deslizar para recargar, aviso de conexión). SYNC-08 ⛔: necesita una cuenta EAS. | `765b9f4` | `sync-refresh.test.ts` |
| Registro | REG-01…REG-13 (3 pasos; apodo en vivo; aviso de correo ya registrado; fortaleza de la contraseña; vehículo obligatorio creado en el trigger del alta; foto opcional subida al tener sesión; borrador sin contraseña; reenviar el correo; aviso a cuentas sin vehículo) | `ab8de97` | `signup.test.ts` |
| Navegación | MAPA-15 (500 m, 200 m y «ahora»), MAPA-16 (40 m durante 5 s), MAPA-20 (modo fantasma), MAPA-21 (en gris), MAPA-22/23 (ficha completa; seguir a cualquier amigo), MAPA-27 (Ajustes) | `8ae7703` | `convoy-five.test.ts` |
| Convoy | CONV-02, CONV-04…CONV-08, CONV-10…CONV-12, CONV-14, CONV-15 | `e346b44` | `convoy-amendment.test.ts` |
| Retos | RETO-01, RETO-03, RETO-04, RETO-06…RETO-08 | `1457938` | `challenge-amendment.test.ts` |

**Sigue pendiente:**
- **Sin hacer o a medias:** MAPA-06 (ajuste a la calle), MAPA-10/11/25/26 (rendimiento y batería, que se miden en el dispositivo), MAPA-24 (push con la app cerrada, que necesita FCM), MAPA-28 (aviso sin conexión dentro del mapa) y RETO-05 (clasificación por ETA real: hoy es por avance).
- **Depende de pasos tuyos:** CONV-13/16 (voz bloqueada hasta corregir el secret de LiveKit), SYNC-08 (cuenta EAS) y el benchmark contra Waze (2.F) en el teléfono.

### Avance (2026-11-04)

Probado en el teléfono (SM-G996U1) salvo donde se indica.

| Área | Criterios | Estado |
|---|---|---|
| Tráfico | MAPA-04 (capa propia sobre todas las calles, no solo puentes y túneles), MAPA-12 (ruta pintada por tramos con el tráfico de Google `TRAFFIC_ON_POLYLINE` y la congestión de Mapbox) | Hecho; función `routes` desplegada |
| Avisos | MAPA-24 (FCM con la app cerrada: invitación a convoy, reto y solicitud de amistad; Edge Function `push` llamada por triggers con `pg_net`) | Hecho en Android y probado. iOS ⛔: falta la clave APNs (Apple Developer) |
| Fallos | Firebase Crashlytics (cierres nativos y de JS, y lo que guarda `error-log`) | Hecho |
| Voz | CONV-13…16 (sala global en `VoiceHost`, botón en el mapa, conexión en 0,9 s, segundo plano con servicio de tipo micrófono) | Hecho |
| Amigos | MAPA-19 (cada 5 s al moverte, también en segundo plano y con la app cerrada; compartir por defecto, modo fantasma para ocultarte) | Hecho |
| Convoy y retos | Convoys borrados y retos cancelados a las 24 h (`purge_expired_parties` cada 15 min con pg_cron) | Hecho |
| Permisos | Todos al entrar (ubicación «siempre», micrófono, notificaciones, actividad, batería); pantalla siempre encendida con la app abierta | Hecho |
| Auditoría | `db-permissions.test.ts`: reproduce grants y revokes de todas las migraciones y falla si se quita a los usuarios el uso de `private` (fallo real del 2026-11-04, corregido en `20261104110000_restore_private_usage.sql`) | Hecho |

**Sigue pendiente:** RETO-05 (clasificación por ETA), MAPA-28 (aviso sin conexión en el mapa), MAPA-06 (ajuste a la calle), MAPA-10/11/25/26 (medir en viaje real), SYNC-08 (EAS), la app de iOS y la publicación en las tiendas.
