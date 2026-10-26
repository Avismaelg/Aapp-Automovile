# Caravana — la red social del coche

Prototipo funcional de una app móvil que combina lo mejor de Wheelz con cuatro piezas propias:

1. **Party / caravana en vivo** — varios coches comparten el mismo viaje, se ven en el mapa, chatean y hablan por **walkie-talkie (push-to-talk)**.
2. **Retos punto A → B** — modo emparejamiento para desafiar a tus amigos; clasificación en vivo, código de invitación y **categorías separadas para coches, motos, vehículos eléctricos y camiones**.
3. **Combustible y energía** — repostajes de gasolina/diésel y cargas eléctricas: consumo real (km/L, L/100 km, MPG, kWh/100 km), costo por km, historial y **PDF**; inspirado en [`samilr/appFuelUsage`](https://github.com/samilr/appFuelUsage).
4. **QR de identidad** — cada usuario y cada vehículo (coche, moto, EV o camión) tienen un QR para llevar en el vehículo. Al escanearlo se abre el perfil público, sin instalar la app.

> **Nombre provisional:** Caravana. Todo el branding está centralizado para poder cambiarlo rápido.
>
> **Repositorio:** [github.com/Avismaelg/Aapp-Automovile](https://github.com/Avismaelg/Aapp-Automovile)

---

## Estado actual

Esto es un **MVP visual y funcional**, todavía no una app publicada. Las pantallas, la autenticación, el mapa real y la capa de garaje/combustible ya están construidas; Supabase está conectado y migrado. Faltan el backend Realtime de party/retos, LiveKit y el build nativo.

| Módulo | Estado |
|---|---|
| Diseño dark + design system | ✅ |
| Autenticación email/contraseña | ✅ UI, validación, sesión persistida, rutas protegidas y registro real probado; faltan Apple/Google y recuperación |
| Perfil editable + público | ✅ nombre, bio, ciudad y privacidad reales en Supabase; perfil público por `@usuario` y vehículos públicos |
| Amigos | ✅ búsqueda por nombre/@usuario, solicitudes, aceptar/rechazar y eliminar; demo con lista de ejemplo |
| Modo demo local | ✅ entra sin claves y conserva la sesión en el dispositivo |
| Home / feed social | ✅ con datos mock |
| Party / mapa en vivo | ✅ mapa real OSM + GPS; PTT simulado |
| Retos / emparejamiento | ✅ 1v1 programado + **reto al momento con 2+ pilotos**, emparejamiento y simulación local; falta backend Realtime y anti-trampas |
| Garaje multi-vehículo | ✅ coche, moto, EV y camión con QR; lectura y alta reales en Supabase + garaje demo persistente; falta edición y fotos |
| Escáner QR | ✅ cámara nativa + fallback web |
| Perfil público por usuario y vehículo | ✅ datos técnicos, mantenimiento de ejemplo e historial de venta PDF; 🟡 falta persistir mantenimientos reales en Supabase |
| Combustible y energía | 🟡 gasolina/diésel + EV, PDF e historial; lectura/escritura base en Supabase; falta persistir el historial demo y editar registros |
| Modo conducción | ✅ pantalla grande y simplificada con party, PTT y reto; CarPlay/Android Auto nativos pendientes de build y aprobación |
| Tracking en segundo plano | 🟡 servicio base (`expo-location` + `TaskManager`), falta UI de revisión |
| Supabase | ✅ proyecto `ecmqmgpruxclmpnnpgzv` conectado; migración `init_caravana` + fix de `search_path`, RLS y trigger de perfil aplicados; Auth, perfil editable, perfil público, amigos, garaje y combustible probados; 🟡 feed/retos siguen mock, advisors de seguridad/performance pendientes |
| Voz real (LiveKit) | ⏳ UI PTT lista; falta SDK nativo + Edge Function de tokens |
| Mapa real + GPS | ✅ OpenStreetMap/Leaflet en Party con tu ubicación en vivo; ✅ rutas por carretera con GraphHopper (cloud o self-hosted) y fallback; 🟡 miembros de party simulados y tiles pendientes de proveedor para producción |
| 3D garage / clubs / meets | ⏳ fase 2 |

**Pantallas:** Bienvenida, Registro, Inicio de sesión, Inicio, Party, Retos, Garaje, Consumo, Perfil, Escáner, Modo conducción, invitación a party, invitación a reto, perfil público, ficha de venta del vehículo y perfil público de vehículo.

### Capturas

| Inicio | Party en vivo | Retos |
|---|---|---|
| ![Inicio](docs/screenshots/home.png) | ![Party](docs/screenshots/party.png) | ![Retos](docs/screenshots/challenges.png) |

| Garaje multi-vehículo | Combustible y EV | Bienvenida |
|---|---|---|
| ![Garaje](docs/screenshots/garage.png) | ![Combustible](docs/screenshots/fuel.png) | ![Bienvenida](docs/screenshots/auth-welcome.png) |

| Modo conducción | Ficha de venta del vehículo |
|---|---|
| ![Modo conducción](docs/screenshots/drive-mode-landscape.png) | ![Ficha de venta](docs/screenshots/vehicle-sale.png) |

| Party con mapa real y GPS |
|---|
| ![Mapa real](docs/screenshots/party-map-real.png) |

---

## Probarlo

Requisitos: Node 20+ y npm.

```bash
cd movil
npm install
npx expo start
```

- `w` → abre la versión web (útil para revisar el diseño).
- Escanea el QR de la terminal con **Expo Go** para verlo en el móvil.
- **Sin variables de entorno**, la app entra directo en modo demo. Para ver la
  bienvenida y los formularios: Perfil → Cuenta → *Salir del modo demo*.
- Con Supabase configurado, la app arranca en bienvenida y exige sesión para las
  pestañas. Los enlaces públicos de perfil, vehículo y reto siguen abriendo sin
  cuenta.
- **Reto al momento:** Retos → elige ruta, categoría y “Elegir 2 aleatorios” →
  *Salir ahora*. También puedes seleccionar los pilotos manualmente.
- **Ficha de venta:** Garaje → abre un vehículo → *Preparar ficha de venta*.
- **Modo conducción:** Inicio → *Conducir* (funciona en horizontal y vertical).
- **Mapa real:** Party → mapa OpenStreetMap con tu GPS en vivo. Si no das
  permiso de ubicación, usa Santo Domingo como ubicación de demo. En web puedes
  conceder el permiso desde el navegador.
- **GraphHopper:** configura `EXPO_PUBLIC_GRAPHHOPPER_URL` o
  `EXPO_PUBLIC_GRAPHHOPPER_API_KEY` para rutas por carretera. Sin motor, la app
  usa una línea directa y lo indica en Party.
- El tracking en segundo plano y la cámara requieren un **development build**, no Expo Go:
  ```bash
  npx expo run:android
  # o en la nube (perfil preview = APK interno):
  npx eas-cli@latest build --profile preview
  ```

Comprobaciones:

```bash
cd movil
npx tsc --noEmit
npx eslint .
npx expo-doctor
```

---

## Supabase del proyecto

- Proyecto: `ecmqmgpruxclmpnnpgzv` (`https://ecmqmgpruxclmpnnpgzv.supabase.co`).
- Migraciones aplicadas: `init_caravana` y `fix_set_updated_at_search_path`.
- 25 tablas en `public` con RLS activado.
- Auth email probado con un usuario temporal, ya eliminado.
- Garaje y repostaje reales probados con Supabase.
- `movil/.env` contiene la URL y la anon key; está ignorado por Git.
- **No** guardar la `service_role` en ninguna variable `EXPO_PUBLIC_*`.

El proyecto de Supabase está vinculado también al MCP de OpenCode para futuras
migraciones y consultas.

---

## Conectar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Copia `movil/.env.example` a `movil/.env` y rellena:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
3. Aplica el esquema:
   ```bash
   cd movil
   npx supabase link --project-ref TU_REF
   npx supabase db push
   ```
   O pega `docs/03-modelo-datos.sql` en el SQL Editor.
4. Activa **Authentication → Providers → Email**. Para el MVP, desactiva
   **Confirm email** o configura la **Site URL** si vas a probar la confirmación
   en web. Apple y Google quedan para la siguiente fase.
5. Crea los buckets `avatars`, `vehicles`, `posts` y `receipts`.
6. Reinicia con `npx expo start --clear`.

El cliente está en `movil/src/lib/supabase.ts` y el estado de sesión en
`movil/src/store/auth.ts`. Si no hay variables de entorno, la app usa el modo
demo y sigue funcionando. El detalle del flujo, validaciones y pendientes está en
[`docs/05-autenticacion.md`](docs/05-autenticacion.md). La capa de garaje y
combustible está documentada en
[`docs/06-datos-garaje-combustible.md`](docs/06-datos-garaje-combustible.md).

---

## Conectar GraphHopper

Para rutas por carretera reales:

```env
# Servidor propio
EXPO_PUBLIC_GRAPHHOPPER_URL=http://localhost:8989
EXPO_PUBLIC_GRAPHHOPPER_PROFILE=car
```

o, usando la API cloud:

```env
EXPO_PUBLIC_GRAPHHOPPER_API_KEY=tu_api_key
```

El servidor local está en `infra/graphhopper/`; instrucciones completas en
[`docs/09-graphhopper.md`](docs/09-graphhopper.md). Si no hay motor configurado,
Party muestra una ruta directa y sigue funcionando.

---

## Estructura

```
app de auto/
├─ docs/
│  ├─ 01-producto.md          # visión, personas, alcance, roadmap, monetización
│  ├─ 02-arquitectura.md      # stack, flujos, seguridad, costes
│  ├─ 03-modelo-datos.sql     # esquema Supabase + RLS + Realtime
│  ├─ 04-checklist-mvp.md     # qué falta para lanzar
│  ├─ 05-autenticacion.md     # flujo de cuentas, Supabase y pendientes
│  ├─ 06-datos-garaje-combustible.md # capa de datos de garaje y energía
│  ├─ 07-carplay-android-auto.md # modo conducción y proyección nativa
│  ├─ 08-mapa-tiempo-real.md   # mapa OSM y GPS en vivo
│  └─ 09-graphhopper.md        # rutas por carretera con GraphHopper
├─ infra/
│  └─ graphhopper/             # servidor Docker + extracto OSM
├─ movil/
│  ├─ app/                    # Expo Router (pantallas)
│  │  ├─ (auth)/              # Bienvenida, login y registro
│  │  ├─ (tabs)/challenges.tsx # Retos programados + reto al momento
│  │  ├─ challenge/[code].tsx  # Invitación a reto
│  │  ├─ drive.tsx             # Modo conducción
│  │  ├─ v/[slug].tsx          # Perfil público de vehículo
│  │  └─ v/[slug]/sale.tsx     # Ficha de venta con historial
│  ├─ src/components/         # UI, mapa, QR, PTT, feed, auth
│  ├─ src/hooks/              # perfil conectado
│  ├─ src/lib/                # Supabase, QR, combustible/EV, PDF, tracking
│  ├─ src/store/              # sesión, tracking y autenticación
│  ├─ src/data/mock.ts        # datos de la demo
│  ├─ scripts/generate_icons.py
│  └─ supabase/migrations/    # migración lista para `supabase db push`
└─ investigacion-competencia-wheelz.md
```

---

## Decisiones de producto ya tomadas

- **No clonar el garaje 3D de 300 coches en el MVP.** Primero foto + icono 2D; el 3D es fase 2 con packs descargables.
- **La voz es el diferenciador.** Wheelz no tiene PTT; una caravana real se coordina hablando.
- **Retos seguros, no carreras ilegales.** El reto mide llegada, nunca velocidad máxima, y muestra un aviso de conducción responsable. Las categorías de coche, moto, EV y camión compiten por separado; el modo mixto se resuelve por llegada.
- **Privacidad por defecto.** La ubicación solo se comparte dentro de una party; el QR no contiene teléfono ni ubicación.
- **Social gratis, memoria y herramientas de pago.** El plan Pro cobrará historial ilimitado, stats, 3D y PDF sin marca.
- **Español primero, LatAm/España después.** Soporte de DOP, USD, EUR, MXN y unidades métricas/imperiales.

---

## Lo que falta para producción

- Conectar el proyecto Supabase y probar altas reales de vehículos y repostajes (la capa ya está escrita).
- Pasar feed y retos de mocks a consultas reales.
- Apple/Google, recuperación de contraseña, cambio de `@usuario`, avatar y borrado de cuenta.
- Publicar posiciones reales de la party por Supabase Realtime; hoy los otros miembros son demo.
- Elegir proveedor de teselas para producción y perfiles GraphHopper de moto/camión/EV.
- LiveKit Cloud + Edge Function para tokens + PTT nativo.
- Retos en Supabase Realtime: invitaciones, salas al momento, salida/meta, progreso y anti-trampas.
- Detección de viajes con revisión/edición (unir, dividir, descartar).
- CarPlay/Android Auto nativos: entitlement de Apple, categoría de Android Auto, build nativo y aprobación de tiendas.
- Push notifications, moderación y analítica.
- Builds iOS/Android, TestFlight/Play Internal y 20–50 beta testers.

El detalle está en [`docs/04-checklist-mvp.md`](docs/04-checklist-mvp.md).

---

## Aviso

“Wheelz” es una marca de terceros. Caravana es un nombre provisional; antes de publicar hay que verificar disponibilidad de marca y dominio. Las funciones de velocidad se limitan a estadísticas privadas: no hay leaderboards de velocidad por seguridad y por las políticas de las tiendas.
