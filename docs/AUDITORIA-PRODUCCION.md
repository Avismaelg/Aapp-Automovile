# Auditoría de producción — Caravana

Rama `fix/production-readiness`, base `2918796`. Fecha: 2026-11-04.

**Veredicto: NO-GO** (ver `CHECKLIST-LANZAMIENTO.md`). Los 5 P0 están
corregidos en código con pruebas, pero sus migraciones **no se han aplicado** ni
probado contra una base real.

## Método

- Estado final de las políticas RLS reconstruido aplicando las 27 migraciones en
  orden (`drop policy` / `create policy`), no leyendo la documentación.
- Lectura de las 5 Edge Functions, de los hooks de ubicación, voz y convoy, y
  de `app.json`, `eas.json`, `package.json` y `.github/workflows`.
- **No** se consultó la base de datos de producción: lo que dice este informe
  sobre RLS sale de las migraciones. Debe confirmarse en un entorno separado
  (ver `PRUEBAS-PRODUCCION.md`).

## Referencia (antes de cambiar nada)

| Comando | Resultado |
|---|---|
| `npm ci` | OK |
| `npm run typecheck` | OK, 0 errores |
| `npm run lint` | OK, 0 errores |
| `npm test -- --coverage` | 42 suites, 281 pruebas OK; cobertura 69,8 % instrucciones, 58,4 % ramas |
| `npx expo-doctor` | **Falla 1 comprobación**: 10 paquetes Expo con versión de parche atrasada. El workflow `quality.yml` lo ejecuta, así que **CI falla** |

## Inventario

| Área | Piezas | Estado |
|---|---|---|
| Cuentas | Supabase Auth, registro en 3 pasos con vehículo, borrado (`delete-account`) | Funciona |
| Mapa | `@rnmapbox/maps`, tráfico propio, coche 3D | Funciona en Android |
| Búsqueda y rutas | Edge Functions `places` y `routes` (Google, con tope diario), Mapbox, GraphHopper, OSRM público, línea directa | Funciona; el último recurso es una línea directa |
| Convoy | `parties`, `party_members`, `party_invites`, RPC `join_party`, `accept_party_invite`, `leave_party`, `kick_party_member`, `set_party_member_role`, `end_party` | Funciona; RLS débil (P0-1) |
| Voz | LiveKit, `livekit-token`, `VoiceHost` | Funciona; no se expulsa de la sala al perder acceso (P1-3) |
| Ubicación | `live-share.ts`, `tracking.ts`, `friend_locations`, servicio de primer plano | Funciona; compartir con amigos activado por defecto (P1-1) |
| Retos | `challenges`, `challenge_participants`, `report_challenge_progress` | Funciona; resultados manipulables (P0-5) |
| Récords | `speed_records`, `highway_segments`, `app/records.tsx` | **Clasificación pública por velocidad (P0-4)** |
| Avisos y fallos | Edge Function `push`, FCM, APNs, Crashlytics | Funciona en Android |
| CI | `quality.yml` (tsc, lint, doctor, jest, export web), `pages.yml` | Falla por expo-doctor |

Dependencias críticas: Expo SDK 58, React Native 0.88, Supabase JS 2,
LiveKit RN 2 / livekit-client 2.23, rnmapbox 10.3.7, React Native Firebase 27.

## Hallazgos

### P0 — bloquean el lanzamiento

**P0-1. Cualquier usuario puede meterse en un convoy ajeno, darse el rol de líder o volver tras ser expulsado.**
- Evidencia: `supabase/migrations/20261025000000_init_caravana.sql:859` (`party_members_insert … with check (user_id = auth.uid())`) y `:863` (`party_members_update … using (user_id = auth.uid() or …)` sin restringir columnas).
- Impacto: con el `id` de un convoy (los públicos se listan en `parties_select`) un usuario se inserta como miembro sin código ni invitación, saltando el límite de pilotos (que solo aplican las RPC). Ya dentro, puede ponerse `role = 'host'` o `'sweeper'`, cambiar `party_id` de su fila o borrar su `left_at` tras ser expulsado; así ve posiciones y chat y obtiene token de voz.
- Corrección: quitar `insert` directo (solo por RPC `security definer`), limitar `update` del propio miembro a las columnas de posición/progreso/canal y mover rol, pertenencia y `left_at` a RPC; bloquear la vuelta de expulsados.
- Aceptación: como usuario ajeno, `insert` en `party_members` → denegado; como miembro, `update set role='host'` → denegado; expulsado → `join_party` responde `kicked`.

**P0-2. El que envía una solicitud de amistad puede aceptarla él mismo.**
- Evidencia: `init_caravana.sql:777` (`friendships_update … using/with check (auth.uid() in (requester_id, addressee_id))`).
- Impacto: `update friendships set status='accepted'` por el remitente crea una amistad que el otro no aceptó → ve su **ubicación en vivo** (`friend_locations_select` usa `are_friends`), sus vehículos «solo amigos» y su perfil privado. También puede cambiar `addressee_id`.
- Corrección: solo el destinatario cambia `pending → accepted/declined` (RPC o política + trigger de transición); nadie cambia los ids.
- Aceptación: remitente `update status='accepted'` → denegado; destinatario → permitido; `update addressee_id` → denegado.

**P0-3. Las matrículas, el odómetro y los datos de todos los vehículos son públicos.**
- Evidencia: `init_caravana.sql:190` (`vehicles.privacy … default 'public'`) y `:748` (`vehicles_select … or privacy = 'public'`): la política devuelve la fila entera, `plate` incluida. El registro crea el vehículo con la matrícula (`20261103100000_signup_with_vehicle.sql:111`).
- Impacto: cualquiera, incluso sin sesión, lee la matrícula y el odómetro de cada vehículo. La app dice «la matrícula y el odómetro son privados por defecto».
- Corrección: quitar a `anon`/`authenticated` el `select` de las columnas `plate` y `odometer_km` (y `home_location` de `profiles`) y servirlas solo al dueño (RPC o vista).
- Aceptación: como visitante y como usuario ajeno, `select plate from vehicles` → denegado o nulo; como dueño → visible.

**P0-4. Clasificación pública de velocidad por tramo de autopista.**
- Evidencia: `20261028100000_production_reconcile.sql:86` (`speed_records_read_public … using (is_public)`), `app/records.tsx:37`, `src/lib/highway-records.ts`.
- Impacto: incentiva correr para subir puestos; riesgo para usuarios y terceros y motivo de rechazo en las tiendas.
- Corrección: retirar la clasificación pública y la pantalla de récords públicos; conservar solo estadísticas privadas del propio usuario.
- Aceptación: no hay ninguna lectura de velocidades ajenas; la pantalla muestra solo tus datos.

**P0-5. Los resultados de los retos los decide el cliente.**
- Evidencia: `init_caravana.sql:1179` y `:1185` (`challenge_participants` insert/update con `user_id = auth.uid()`, sin limitar columnas) y `20261103140000_challenge_amendment.sql:54` (`report_challenge_progress` confía en `p_arrived`).
- Impacto: un participante se pone `finish_rank = 1`, `status='finished'` o `progress_pct=100` con un `update` directo, o se inscribe solo en un reto ajeno; o envía `p_arrived = true` sin estar en la meta.
- Corrección: sin `insert`/`update` directo del participante (todo por RPC); `report_challenge_progress` recibe la posición y la comprueba contra la meta, la precisión y la antigüedad; marca el resultado como «verificado» o «autodeclarado».
- Aceptación: `update challenge_participants set finish_rank=1` → denegado; llegada con la posición lejos de la meta → `not_at_finish`.

### P1 — estabilidad, seguridad y funcionamiento

| # | Hallazgo | Evidencia | Corrección |
|---|---|---|---|
| P1-1 | Compartir la ubicación con amigos está **activado por defecto** (cambio del 2026-11-03) | `src/hooks/useLiveShare.ts:21` (`!== false`) | Desactivado por defecto; consentimiento explícito; revocar borra la última posición |
| P1-2 | `join_party` sin bloqueo: dos entradas a la vez pueden pasar del límite | `production_reconcile.sql:208-214` | `select … for update` del convoy antes de contar |
| P1-3 | Quien sale o es expulsado sigue en la sala de voz hasta que cuelga (token de 2 h y caché de 90 min) | `functions/livekit-token/index.ts:123`; `src/hooks/useVoiceRoom.ts` | Expulsar de la sala en LiveKit al salir/expulsar (RoomService) y token de 15 min |
| P1-4 | El borrado de cuenta responde éxito aunque queden archivos sin borrar | `functions/delete-account/index.ts:116` | Devolver `partial` con lo pendiente y una cola de limpieza reintentable |
| P1-5 | Con la línea directa de respaldo se puede «Iniciar» la navegación como si fuera una ruta | `app/(tabs)/index.tsx:1549` | No ofrecer navegación giro a giro sin ruta por carretera; reintentar |
| P1-6 | CI falla: `expo-doctor` detecta 10 paquetes atrasados | `.github/workflows/quality.yml` | `npx expo install --fix` (versiones de parche) |
| P1-7 | `livekit-token` no comprueba que el convoy no haya caducado (`expires_at`) | `livekit-token/index.ts` (consulta de `parties`) | Filtrar `expires_at > now()` |
| P1-8 | `home_location` de `profiles` es legible con el perfil (hoy sin uso en la app) | `init_caravana.sql:122`, `:735` | Revocar la columna (junto con P0-3) |

### P2 — moderados

| # | Hallazgo | Evidencia | Corrección |
|---|---|---|---|
| P2-1 | El nombre en la sala de voz usa la parte del correo antes de la `@` si no hay nombre | `livekit-token/index.ts:117` | Usar el `display_name` del perfil o «Piloto» |
| P2-2 | `delete-account` lista solo 1.000 archivos por carpeta | `delete-account/index.ts` (`list(folder, { limit: 1000 })`) | Paginar |
| P2-3 | El OSRM público de demostración es un respaldo en producción | `src/lib/graphhopper.ts` | Quitarlo o tratarlo como «sin ruta» con aviso |
| P2-4 | `index.tsx` tiene ~1.700 líneas y se vuelve a pintar con cada lectura de GPS | `app/(tabs)/index.tsx` | Medir con el profiler; separar componentes memoizados |
| P2-5 | Un expulsado puede volver a entrar con el código | `join_party` (`on conflict … set left_at = null`) | Parte de P0-1: marca `kicked_at` |
| P2-6 | La política de privacidad es un borrador sin revisión legal | `docs/politica-privacidad-borrador.md` | Revisión legal antes de publicar |

### P3 — mejoras

- Cobertura de ramas del 58 %: subir en `src/lib` de ubicación, voz y rutas.
- Pruebas de RLS contra una base real (hoy son estáticas sobre las migraciones).
- `NSAllowsArbitraryLoads` heredado de la plantilla: restringir dominios.

## Lo que no se puede verificar aquí

- RLS sobre la base real (falta un entorno de Supabase separado).
- GPS, batería, pantalla bloqueada y reinicio del teléfono (necesitan viaje real).
- Compilación iOS (necesita cuenta de Apple y EAS).

## Estado tras las correcciones (2026-11-04)

| Hallazgo | Estado | Commit | Prueba | Falta |
|---|---|---|---|---|
| P0-1 convoys | Corregido en código | `639e9ba` | `rls-hardening` | Aplicar migración y prueba real |
| P0-2 amistades | Corregido en código | `639e9ba` | `rls-hardening` | idem |
| P0-3 / P1-8 matrícula, home_location | Corregido en código | `639e9ba` | `rls-hardening` | idem; instalar la APK nueva antes |
| P0-4 velocidad pública | Corregido (app + migración) | `5e6d8f9` | `segment-stats`, `rls-hardening` | Aplicar migración |
| P0-5 retos | Corregido en código | `9caa3c6` | `rls-hardening` | Aplicar migración; prueba en dispositivo |
| P1-1 compartir con amigos | Revertido por decisión de producto: activado por defecto con aviso y modo fantasma (`bce1523`) | `7a80043`, `bce1523` | `location-consent-states` | Prueba en dispositivo |
| P1-2 carrera al entrar | Corregido (`for update`) | `639e9ba` | `rls-hardening` | Aplicar migración |
| P1-3 / P1-7 / P2-1 voz | Corregido (revocación, 15 min, convoy vigente, nombre) | `77d5c95` | `rls-hardening` | Desplegar funciones; prueba de expulsión |
| P1-4 / P2-2 borrado de cuenta | Corregido (parcial informado, cola, paginación) | `1d0f1f5`, `f2789ce` | `rls-hardening`, `deno check` | Desplegar función |
| P1-5 / P2-3 línea directa y OSRM | Corregido | `3264dc4` | `route-fallback` | Prueba en dispositivo |
| P1-6 CI | Corregido (expo-doctor OK, job Deno) | `af0fd47`, `f2789ce` | — | Ver el workflow en GitHub |
| P2-4 rendimiento del mapa | Abierto | — | — | Medir en el teléfono |
| Viaje sin cerrar, fecha «4 oct», pico de velocidad (viaje real) | Corregido | `6ea9482` | `trip-close`, `i18n` | Prueba en dispositivo |
| MAPA-06 coche fuera de la calle / sin «Has llegado» (viaje real) | Corregido | `a0fc905` | `navigation-arrival-snap` | Prueba en dispositivo |
| RETO-05 clasificación por ETA | Hecho | `bd58deb` | `challenge-eta` | Aplicar migración 127000 |
| MAPA-28 navegación sin conexión (incluido el recálculo tras varios desvíos) | Hecho | `843834f`, `ff97eaa` | `offline-navigation`, `reroute-deviations` | Prueba en dispositivo |
| P2-5 vuelta tras expulsión | Corregido (con P0-1) | `639e9ba` | `rls-hardening` | — |
| P2-6 revisión legal | Abierto | — | — | Abogado |

Compatibilidad: la migración `private_columns` rompe el garaje de las APK
anteriores (piden `select('*')`). Orden: APK nueva → migraciones.
