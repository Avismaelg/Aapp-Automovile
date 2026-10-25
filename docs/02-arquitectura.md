# Caravana — Arquitectura técnica (v0.1)

> **Objetivo:** una app móvil cross-platform (iOS + Android) con tracking en segundo plano, mapa en vivo, voz PTT, QR y gestión de combustible, sobre un backend gestionado que permita lanzar un MVP en 6–8 semanas.

---

## 1. Stack recomendado

| Capa | Tecnología | Por qué |
|---|---|---|
| Móvil | **Expo (React Native) + TypeScript** | Un código para iOS/Android; iteración rápida; EAS Build |
| Navegación | **Expo Router** | Rutas por archivos + deep links para QR |
| UI | Design system propio (dark) + Reanimated | Control total; animaciones fluidas |
| Estado | **Zustand** (cliente) + **TanStack Query** (servidor) | Simple y cacheado |
| Backend | **Supabase** (Postgres + PostGIS, Auth, Realtime, Storage, Edge Functions) | Auth, RLS, realtime y SQL en un solo sitio |
| Mapas | **Mapbox** (o MapLibre + OSM) | Estilo oscuro, rutas, marcadores en vivo |
| Voz | **LiveKit** (SDK React Native) | WebRTC, PTT, salas, grabación opcional |
| Tracking | **expo-location + expo-task-manager** + módulo nativo para actividad | Background location en ambos OS |
| QR | **react-native-qrcode-svg** + **expo-camera** | Generar y escanear sin servicio externo |
| PDF | **expo-print + expo-sharing** | Reporte de combustible |
| Push | **Expo Notifications** + Edge Function | Invitaciones, party, logros |
| Analítica | PostHog (opt-in) + Sentry | Producto + errores |
| CI/CD | GitHub Actions + EAS Build/Submit + Supabase CLI | Migraciones y builds reproducibles |

**Alternativas:** Flutter (si el equipo ya lo domina), React Native CLI (si se necesita un módulo nativo muy específico), Firebase (si se prefiere NoSQL; peor para geodatos y RLS).

---

## 2. Diagrama de alto nivel

```
┌──────────────────────────── App móvil (Expo) ────────────────────────────┐
│  Onboarding/Auth   Home/Feed   Garage/QR   Party/Mapa   Fuel   Profile   │
│        │              │           │           │          │       │       │
│   Supabase JS     TanStack     expo-camera  LiveKit    expo-print  ...  │
│        │           Query          │           │          │               │
│        └──────────────┬───────────┴───────────┴──────────┘               │
│                 Tracking service (background task)                        │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ HTTPS / WSS
┌───────────────────────────────▼──────────────────────────────────────────┐
│                              Supabase                                     │
│  Auth  │  Postgres + PostGIS  │  Realtime (broadcast/presence)  │ Storage │
│  RLS   │  Functions/RPC       │  Edge Functions (tokens, push)   │  CDN    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
                 ┌──────────────┴──────────────┐
                 │        LiveKit Cloud        │
                 │  Salas de voz / PTT / TURN  │
                 └─────────────────────────────┘
```

---

## 3. Módulos

### 3.1 Auth y perfil
- Supabase Auth: email + Apple + Google.
- Trigger `handle_new_user()` crea `profiles` con username generado y `qr_slug`.
- Onboarding: nombre, username, ciudad, coche principal, unidades/moneda, foto.
- Sesión persistida con SecureStore.
- Eliminación de cuenta in-app (requisito App Store).

### 3.2 Garaje y QR
- `vehicles`: marca, modelo, año, apodo, foto, color, placa (privada), odómetro.
- QR de perfil: `https://caravana.app/u/{username}`.
- QR de vehículo: `https://caravana.app/v/{qr_slug}`.
- Generación local del QR (sin llamada al backend).
- Descarga como PNG/PDF para imprimir.
- Escáner in-app con `expo-camera`; la cámara del sistema abre la URL.
- Página web pública (Next.js o Edge Function) para quien no tiene la app:
  - perfil público → tarjeta + botón “Abrir en Caravana”.
  - perfil privado → tarjeta mínima + solicitud.
- Privacidad por campo: placa, ubicación, rutas.

### 3.3 Tracking automático
**Estados:** `idle → candidate → recording → paused → completed`.

**Reglas iniciales (ajustables):**
- Inicio: velocidad > 12 km/h durante 45 s, precisión < 50 m, al menos 3 puntos.
- Pausa: velocidad < 3 km/h durante 3 min (tolera atascos y semáforos).
- Fin: pausa > 8 min, o el usuario pulsa “terminar”.
- Descarte: velocidad > 250 km/h o altitud incompatible (avión); el usuario puede marcar “no era un viaje”.
- Post-proceso: filtro de outliers, simplificación Douglas-Peucker, empalme de huecos < 10 min.
- Subida: chunks cada 60 s o al terminar; reintento con backoff; cola local.

**Batería:**
- Intervalo adaptativo: 10 s en movimiento, 30 s en pausa, 60 s si batería < 20 %.
- `distanceInterval` 25 m; `deferredUpdatesInterval` 30 s.
- Detener tracking si el usuario lo desactiva o si la party termina.

**Permisos:**
- iOS: `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes: location`, `audio` (PTT).
- Android: `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, notificación persistente.

**Riesgo:** los OEM Android (Xiaomi, Huawei, Samsung) matan servicios. Mitigación: guía de ajustes por fabricante + foreground service + WorkManager.

### 3.4 Party / convoy
**Crear:**
1. Cliente inserta `parties` (host, nombre, destino, privacidad, `invite_code` aleatorio, `voice_room`).
2. Inserta `party_members` (host).
3. Pide token a Edge Function `livekit-token` con `room`, `identity`, `canPublish`.
4. Se une a la sala de voz con micrófono muteado.

**Unirse:**
- Link `https://caravana.app/p/{code}` o código de 6 caracteres.
- RPC `join_party(code)` valida aforo/estado y devuelve la party.
- Se suscribe al canal Realtime `party:{id}`.

**Tiempo real:**
- **Ubicación:** `channel.send({ type: 'broadcast', event: 'location', payload })` cada 3–5 s. No se escribe en Postgres en cada tick.
- **Presencia:** `channel.track({ user_id, name, avatar, vehicle })`.
- **Persistencia:** cada 30 s se actualiza `party_members.last_location` (para reconexión y resumen).
- **Texto:** tabla `party_messages` + Realtime postgres_changes.
- **Voz:** LiveKit; PTT = `localParticipant.setMicrophoneEnabled(true/false)` al pulsar/soltar.
- **Reconexión:** al volver, se reconstruye el estado desde `party_members` + presencia.

**Privacidad:**
- La party es privada por defecto; la ubicación solo se comparte dentro.
- Al terminar, se deja de emitir; el historial de ubicaciones se borra a los 30 días (configurable).
- Botón “salir” y “bloquear”.

### 3.5 Retos punto A → B y emparejamiento
**Crear / emparejar:**
1. El host elige ruta (salida/meta), distancia, categoría (`car`, `motorcycle`, `ev`, `truck` o `mixed`) e invita a un amigo.
2. Se inserta `challenges` + `challenge_participants`; el invitado acepta o rechaza.
3. El reto pasa a `live` cuando ambos están en la salida; se abre un canal Realtime `challenge:{id}`.
4. La app emite ubicación cada 3–5 s solo a los participantes (Broadcast) y actualiza `progress_pct` cada 30 s.
5. La meta se valida con `ST_DWithin(end_point, location, 75)`; el primero en entrar queda como `finish_rank = 1`.

**Categorías y equidad:**
- Coches, motos, EV y camiones tienen clasificación propia.
- En modo `mixed`, se muestra el aviso y el resultado se ordena por llegada; nunca por velocidad punta.
- En EV se registran paradas de carga; en camión se aplican límites de peso/velocidad; en moto se exige equipo completo.
- El servidor rechaza `progress_pct` sin ubicación válida y marca saltos imposibles.

**Seguridad y anti-trampas:**
- Sin apuestas, sin leaderboards de velocidad y con aviso de conducción responsable.
- Detección de ubicación simulada, saltos GPS, velocidad imposible y llegada sin pasar por la salida.
- Reportar/bloquear desde el reto; cancelación y expulsión por el host.

**Combustible/energía se mantiene como módulo separado (3.6):**

### 3.6 Combustible y energía
- `fuel_logs` por vehículo, con `kind = fuel | electric` y cantidad en L o kWh.
- Cálculo con método de tanque lleno para gasolina/diésel:
  - `consumo = distancia_recorrida / volumen_repostado` (solo entre llenos).
  - `L/100km = volumen / distancia * 100`.
  - `MPG = distancia_millas / galones`.
  - `costo_por_km = total / distancia`.
- EV:
  - `kWh/100 km = energia_kwh / distancia * 100`.
  - `km/kWh = distancia / energia_kwh`.
  - Precio por kWh y costo por carga.
- Repostajes/cargas parciales: se acumulan hasta el siguiente lleno.
- Stats: último, promedio 3/6/12 meses, mejor/peor, tendencia.
- Alertas: consumo > 15 % sobre la media; mantenimiento por km.
- Export: PDF (expo-print) y CSV.
- Multi-moneda y unidades.

### 3.7 Feed social
- `posts`: viaje, foto, logro o party.
- Visibilidad por post.
- Like/comentario/guardar.
- Feed = amigos + clubs + propios.
- Moderación: reportar/bloquear; cola de revisión.
- Fase 2: clubs, meets, rutas.

---

## 4. Modelo de datos (resumen)

| Tabla | Propósito |
|---|---|
| `profiles` | Usuario público, username, QR, privacidad, unidades |
| `vehicles` | Garaje multi-tipo (coche/moto/EV/camión), QR, odómetro, eficiencia |
| `friendships` | Solicitudes y amistad |
| `blocks` | Bloqueos |
| `drives` | Trayectos, ruta PostGIS, stats, visibilidad |
| `drive_passengers` | Pasajeros etiquetados |
| `parties` | Convoy, invitación, destino, sala de voz |
| `party_members` | Miembros, rol, última ubicación |
| `party_messages` | Chat de texto |
| `challenges` | Retos A → B, categoría, estado, salida/meta |
| `challenge_participants` | Invitado, vehículo, progreso, llegada y ranking |
| `fuel_logs` | Repostajes/cargas y cálculo |
| `posts` / `post_media` | Feed |
| `likes` / `comments` / `saves` | Interacción |
| `clubs` / `club_members` | Clubs (fase 2) |
| `meets` / `meet_attendees` | Quedadas (fase 2) |
| `notifications` | Push/in-app |
| `device_tokens` | Expo push |
| `reports` | Moderación |
| `qr_scans` | Analítica de escaneos |

**Extensiones:** `postgis`, `pgcrypto`, `citext` (opcional), `pg_trgm` (búsqueda).

**Geodatos:**
- `drives.route geography(LineString, 4326)`
- `drives.start_point/end_point geography(Point, 4326)`
- `parties.destination geography(Point, 4326)`
- Índices GIST.

---

## 5. Seguridad y privacidad

1. **RLS en todas las tablas.** Ninguna tabla pública sin política.
2. **Ubicación:** solo miembros de la party; retención 30 días; no se guarda en el feed.
3. **QR:** URL opaca, sin email/teléfono; el dueño puede revocar.
4. **Placa:** privada por defecto; solo se muestra si el dueño lo activa.
5. **Storage:** buckets privados + URLs firmadas; strip EXIF al subir.
6. **Edge Functions:** service role solo ahí; nunca en el cliente.
7. **Rate limiting:** invitaciones, mensajes, escaneos, reportes.
8. **Moderación:** reportar/bloquear; revisión manual al inicio.
9. **Cumplimiento:** borrado de cuenta y datos; política de privacidad; edad 13+/16+ según país.
10. **Auditoría:** logs de acceso a ubicación y descargas.

---

## 6. Costes estimados (etapa temprana)

| Servicio | Plan inicial | Coste |
|---|---|---|
| Supabase | Free → Pro | $0 → $25/mes |
| LiveKit Cloud | Free → Scale | $0 → ~$50/mes según minutos |
| Mapbox | Free (50k MAU) | $0 |
| EAS Build | Free/Starter | $0 → $99/mes |
| Apple Developer | Anual | $99/año |
| Google Play | Único | $25 |
| Dominio + email | Anual | ~$20–50/año |
| Sentry/PostHog | Free | $0 |
| **Total** | | **~$0–150/mes + stores** |

**Coste variable principal:** minutos de voz y mapas. Se controla con límites de party y PTT bajo demanda.

---

## 7. Estructura del repositorio

```
app de auto/
├─ docs/
│  ├─ 01-producto.md
│  ├─ 02-arquitectura.md
│  ├─ 03-modelo-datos.sql
│  └─ 04-checklist-mvp.md
├─ movil/                 # Expo app
│  ├─ app/                # Expo Router
│  │  ├─ (auth)/
│  │  ├─ (tabs)/
│  │  │  ├─ index.tsx     # Home/feed
│  │  │  ├─ party.tsx      # Party/mapa
│  │  │  ├─ challenges.tsx # Retos/emparejamiento
│  │  │  ├─ garage.tsx     # Garaje/QR
│  │  │  ├─ fuel.tsx       # Combustible/EV
│  │  │  └─ profile.tsx
│  │  ├─ drive/[id].tsx
│  │  ├─ party/[code].tsx
│  │  ├─ v/[slug].tsx      # Perfil público de vehículo
│  │  ├─ u/[username].tsx
│  │  └─ scan.tsx
│  ├─ src/
│  │  ├─ components/
│  │  ├─ features/
│  │  ├─ lib/             # supabase, livekit, tracking, qr
│  │  ├─ store/
│  │  ├─ theme/
│  │  └─ types/
│  ├─ supabase/
│  │  ├─ migrations/
│  │  └─ functions/
│  └─ assets/
└─ web/                   # Landing + perfil QR (fase 2)
```

---

## 8. Estrategia de implementación

### Semana 1–2: fundación
- Crear Supabase, aplicar migraciones, auth.
- Design system y navegación.
- Perfil + garaje + QR.

### Semana 3–4: tracking
- Servicio de background location.
- Detección, post-proceso, timeline, stats.
- Pruebas en Android e iOS reales (no emulador).

### Semana 5–6: party
- CRUD de parties, invitación, mapa en vivo, chat.
- LiveKit + PTT.
- Pruebas de reconexión y batería.

### Semana 7: retos
- Emparejamiento, invitaciones, salida/meta y Realtime.
- Categorías coche/moto/EV/camión y modo mixto.
- Geocerca de llegada y anti-trampas básico.

### Semana 8: combustible/EV + beta
- Registro, cálculo, PDF.
- Feed básico, push, moderación.
- TestFlight/Play Internal, 20–50 usuarios.

### Semana 9–12: pulido + lanzamiento
- Onboarding, empty states, errores, analítica.
- ASO, landing, video demo.
- Lanzamiento blando en una ciudad.

---

## 9. Testing

- **Unit:** cálculos de combustible/EV, geocerca de retos, detección, geo.
- **Integración:** Supabase + RLS (pgTAP).
- **E2E:** Maestro o Detox para flujos críticos (login, crear party, registrar repostaje, escanear QR).
- **Campo:** 5 dispositivos Android de gama media + 3 iPhone; pruebas de 2 h de ruta con voz.
- **Batería:** perfilado con Xcode Instruments / Android Studio.

---

## 10. Decisiones que bloquean el arranque

1. Nombre y dominio.
2. Cuentas: Supabase, LiveKit, Mapbox, Apple, Google.
3. ¿Mapbox (token) o MapLibre (sin token, menos pulido)?
4. ¿Voz con LiveKit Cloud o self-hosted?
5. ¿Se acepta foto + 2D en MVP y 3D en fase 2?
