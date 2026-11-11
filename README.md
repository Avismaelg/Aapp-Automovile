# Caravana — salir en carro con tus amigos, juntos

App móvil para conducir en grupo en República Dominicana: **un mapa compartido,
una ruta común con tráfico real y un walkie-talkie**, todo en la misma pantalla.

1. **Convoy en vivo:** todos se ven en el mapa en tiempo real y van a un destino
   común que fija el líder; cada uno ve quién va delante, cuánto le falta y
   quién ya llegó.
2. **Walkie-talkie:** mantén pulsado para hablar con el convoy desde el mapa;
   se oye con la pantalla bloqueada.
3. **Mapa y rutas con tráfico:** búsqueda de lugares y rutas de Google con
   tráfico en vivo, carretera pintada donde hay tapón y navegación por voz.
4. **Amigos en el mapa:** tus amigos aparecen en tu mapa aunque no estéis en un
   convoy, con modo fantasma para ocultarte.
5. **Retos punto A → B**, **garaje** con QR y consumo, y **avisos** con la app
   cerrada.

> **Repositorio:** [github.com/Avismaelg/Aapp-Automovile](https://github.com/Avismaelg/Aapp-Automovile)
> · **Requisitos y su estado:** [`docs/SRS-trazabilidad.md`](docs/SRS-trazabilidad.md)
> · **iPhone:** [`docs/iOS-lanzamiento.md`](docs/iOS-lanzamiento.md)

---

## Estado (2026-11-04)

> **Producción: NO-GO.** Auditoría y correcciones de seguridad en la rama
> `fix/production-readiness`: ver [`docs/AUDITORIA-PRODUCCION.md`](docs/AUDITORIA-PRODUCCION.md)
> y [`docs/CHECKLIST-LANZAMIENTO.md`](docs/CHECKLIST-LANZAMIENTO.md).

**Android funciona y está probado con convoys reales de varios usuarios.** iOS
está preparado y pendiente de la cuenta de Apple Developer. De los 75 criterios
de la enmienda 1.1 del SRS hay unos 66 hechos.

| Módulo | Estado |
|---|---|
| Registro en 3 pasos con vehículo | ✅ apodo único en vivo, correo ya registrado, fortaleza de contraseña, borrador local |
| Mapa (Mapbox) | ✅ estilo de navegación día/noche, coche 3D, tráfico propio en todas las calles, km/h en RD |
| Búsqueda | ✅ Google Places (Edge Function `places`, con tope de gasto diario) + Photon/OSM de respaldo |
| Rutas y navegación | ✅ Google Routes con tráfico (Edge Function `routes`) → Mapbox → GraphHopper → OSRM; ruta pintada por tráfico, voz a 500/200 m y «ahora», recálculo a 40 m, ruta más rápida, paradas |
| Convoy | ✅ crear/unirse (toque, código, QR, enlace), destino común del líder, progreso y llegadas, expulsar, terminar para todos, borrado a las 24 h |
| Voz (LiveKit) | ✅ 3 canales, botón en el mapa, conecta en < 1 s, segundo plano y pantalla bloqueada, manos libres |
| Amigos en el mapa | ✅ posición cada 5 s al moverte, también en segundo plano; activado por defecto; el modo fantasma te oculta |
| Retos | ✅ cuenta atrás, abandono, cancelados a las 24 h; llegada comprobada en el servidor contra la meta («verificada» o «autodeclarada») en `fix/production-readiness`, pendiente de aplicar |
| Récords | Sin clasificaciones ni récords de velocidad: «Tus autopistas» muestra en privado tus viajes y qué parte fuiste dentro del límite |
| Avisos (Firebase) | ✅ Android con la app cerrada (invitación, reto, amistad); iOS por APNs listo, falta la clave de Apple |
| Fallos (Crashlytics) | ✅ cierres nativos y de JavaScript |
| Sincronización | ✅ cada 5 s en la pantalla visible, al volver a la app y al recuperar la red |
| Garaje, QR, consumo, feed, eventos | ✅ |
| iOS | 🟡 configuración lista; falta compilar con EAS y la cuenta de Apple |
| Pendiente | MAPA-06 ajuste a la calle, MAPA-28 aviso sin conexión en el mapa, RETO-05, medición de batería y rendimiento, SYNC-08 (EAS Update), tiendas |

---

## Arquitectura

| Capa | Tecnología |
|---|---|
| App | Expo SDK 58, React Native 0.88, Expo Router, Zustand, TanStack Query |
| Mapa | `@rnmapbox/maps` (Mapbox), capas propias de ruta, tráfico y miembros |
| Servidor | Supabase: Postgres con RLS en todas las tablas, Realtime, Storage, Edge Functions, `pg_cron`, `pg_net` |
| Búsqueda y rutas | Google Places (New) y Routes API desde Edge Functions; la clave vive solo en los secretos de Supabase |
| Voz | LiveKit Cloud; token por Edge Function `livekit-token` (solo miembros) |
| Avisos | Firebase Cloud Messaging (Android) y APNs (iOS) desde la Edge Function `push`, llamada por triggers |
| Fallos | Firebase Crashlytics |
| Segundo plano | `expo-location` + `TaskManager` y el módulo nativo `modules/motion` (servicio en primer plano de Android: conducción, convoy, voz y amigos) |

**Edge Functions** (`movil/supabase/functions`): `places`, `routes`, `livekit-token`,
`push`, `delete-account`.

---

## Probarlo

Requisitos: Node 20+, Android SDK (para compilar en local) o EAS.

```bash
cd movil
npm install
npx expo start          # desarrollo (necesita development build: hay código nativo)
```

**En otra PC** — el repositorio no trae tres archivos (están fuera de git a
propósito); cópialos a mano desde la PC original a la misma ruta:

- `movil/.env` (o créalo a partir de `movil/.env.example`)
- `movil/google-services.json`
- `movil/GoogleService-Info.plist`

```bash
git clone https://github.com/Avismaelg/Aapp-Automovile.git caravana
cd caravana/movil
npm install
npx expo prebuild --platform android   # genera movil/android
```

El servidor (Supabase, LiveKit) no hay que montarlo de nuevo: ya está en la nube
y la app apunta a él con las variables de `.env`.

**APK de Android en local** (Windows, desde `movil/android`):

```powershell
.\gradlew assembleRelease --no-daemon --no-parallel --max-workers=1 "-PreactNativeArchitectures=arm64-v8a" "-Dorg.gradle.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m"
# → app/build/outputs/apk/release/app-release.apk
```

Si cambian plugins o `app.json`: `npx expo prebuild --platform android` antes de
compilar (`android/` e `ios/` se generan, no se editan a mano).

**Comprobaciones** (todas deben pasar antes de un commit):

```bash
npx tsc --noEmit
npx eslint .
npx jest                       # 59 suites, 390 pruebas
node scripts/i18n-missing.js   # textos sin traducir al inglés
```

---

## Configuración

### Variables de la app (`movil/.env`, ignorado por git)

Copia `movil/.env.example`. Solo valores públicos (`EXPO_PUBLIC_*`): URL y anon
key de Supabase, token público de Mapbox y, opcionalmente, GraphHopper y
MapTiler. **Nunca** una `service_role` ni claves de Google, LiveKit o Firebase.

### Archivos de Firebase (ignorados por git)

- `movil/google-services.json` (Android) y `movil/GoogleService-Info.plist`
  (iOS), descargados de la consola de Firebase (proyecto `caravana-ff7ea`,
  paquete `app.caravana.mobile`).
- En EAS llegan como variables de tipo archivo (`movil/app.config.js`).

### Secretos de Supabase (solo en el servidor)

| Secreto | Para |
|---|---|
| `GOOGLE_MAPS_API_KEY` | `places`, `routes` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (hoy guardados como `url`, `Apikey`, `secret`; las funciones aceptan ambos) | `livekit-token`, `livekit-revoke` |
| `FIREBASE_SERVICE_ACCOUNT`, `PUSH_WEBHOOK_SECRET` | `push` (Android) |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` | `push` (iPhone) |

Las migraciones están en `movil/supabase/migrations` (proyecto
`icagznmqialqaclcylza`). La prueba `src/__tests__/db-permissions.test.ts` repasa
todas en orden y falla si alguna quita permisos que la app necesita.

---

## Estructura

```
caravana/
├─ docs/                      # producto, arquitectura, SRS y su trazabilidad, guías
├─ infra/graphhopper/         # servidor de rutas propio (opcional)
└─ movil/
   ├─ app/                    # pantallas (Expo Router)
   ├─ src/components/         # mapa, convoy, voz, UI
   ├─ src/hooks/              # datos y sensores (party, voz, ubicación, retos…)
   ├─ src/lib/                # lógica pura (rutas, tráfico, búsqueda, avisos…)
   ├─ src/store/              # estado local (Zustand)
   ├─ src/i18n/               # español e inglés
   ├─ modules/motion/         # módulo nativo de Android (servicio y actividad)
   └─ supabase/               # migraciones y Edge Functions
```

### Documentación

| Documento | Tema |
|---|---|
| [`01-producto.md`](docs/01-producto.md) | visión, personas, alcance, monetización |
| [`02-arquitectura.md`](docs/02-arquitectura.md) | stack, flujos, seguridad, costes |
| [`08-mapa-tiempo-real.md`](docs/08-mapa-tiempo-real.md) | mapa, GPS y convoy en vivo |
| [`10-retos.md`](docs/10-retos.md) · [`11-party.md`](docs/11-party.md) | retos y convoy |
| [`12-livekit-voz.md`](docs/12-livekit-voz.md) | voz y walkie-talkie |
| [`17-avisos-y-fallos.md`](docs/17-avisos-y-fallos.md) | avisos push (FCM/APNs) y Crashlytics |
| [`SRS-trazabilidad.md`](docs/SRS-trazabilidad.md) | cada requisito, dónde está y su estado |
| [`iOS-lanzamiento.md`](docs/iOS-lanzamiento.md) | pasos para iPhone |
| [`AUDITORIA-PRODUCCION.md`](docs/AUDITORIA-PRODUCCION.md) · [`PLAN-CORRECCIONES.md`](docs/PLAN-CORRECCIONES.md) | hallazgos P0–P3 y su estado |
| [`SEGURIDAD-Y-PRIVACIDAD.md`](docs/SEGURIDAD-Y-PRIVACIDAD.md) | controles de acceso y estados de la ubicación |
| [`PRUEBAS-PRODUCCION.md`](docs/PRUEBAS-PRODUCCION.md) · [`CHECKLIST-LANZAMIENTO.md`](docs/CHECKLIST-LANZAMIENTO.md) | pruebas ejecutadas y pendientes; GO/NO-GO |
| [`politica-privacidad-borrador.md`](docs/politica-privacidad-borrador.md) | privacidad (pendiente de revisión legal) |

---

## Decisiones de producto

- **La voz y el grupo son el diferenciador:** ni Waze ni WhatsApp juntan mapa,
  ruta común y walkie-talkie.
- **Retos seguros:** miden la llegada cumpliendo las normas, nunca la velocidad.
- **Ubicación bajo control:** la ve tu convoy mientras estás en él y tus amigos
  (activado por defecto; el modo fantasma te oculta); los convoys se borran a
  las 24 h. El QR no
  contiene teléfono ni ubicación.
- **Costo casi cero al inicio:** Google con tope de gasto diario y Firebase
  gratis; el plan gratuito permite convoys de hasta 5 pilotos (10 de máximo).
- **Español primero:** RD (km/h, DOP), con inglés completo.

---

## Aviso

“Caravana” es un nombre provisional; antes de publicar hay que verificar la
marca y el dominio. La política de privacidad es un borrador pendiente de
revisión legal.
