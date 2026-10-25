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

Esto es un **MVP visual y funcional en local**, no una app publicada. Ya están construidas las pantallas y la lógica base; faltan las integraciones de producción (auth real, mapas reales, LiveKit y build nativo).

| Módulo | Estado |
|---|---|
| Diseño dark + design system | ✅ |
| Home / feed social | ✅ con datos mock |
| Party / mapa en vivo | ✅ UI + PTT simulado |
| Retos / emparejamiento | ✅ UI + simulación local; falta backend Realtime y anti-trampas |
| Garaje multi-vehículo | ✅ coche, moto, EV y camión con QR por vehículo |
| Escáner QR | ✅ cámara nativa + fallback web |
| Perfil público por usuario y vehículo | ✅ |
| Combustible y energía | ✅ gasolina/diésel + EV, PDF e historial local |
| Tracking en segundo plano | 🟡 servicio base (`expo-location` + `TaskManager`), falta UI de revisión |
| Supabase | 🟡 esquema SQL + RLS listos, cliente preparado; falta conectar auth y datos |
| Voz real (LiveKit) | ⏳ UI PTT lista; falta SDK nativo + Edge Function de tokens |
| Mapas reales | ⏳ mapa estilizado SVG; falta Mapbox/MapLibre |
| 3D garage / clubs / meets | ⏳ fase 2 |

**Pantallas:** Inicio, Party, Retos, Garaje, Consumo, Perfil, Escáner, invitación a party, invitación a reto, perfil público y perfil público de vehículo.

### Capturas

| Inicio | Party en vivo | Retos |
|---|---|---|
| ![Inicio](docs/screenshots/home.png) | ![Party](docs/screenshots/party.png) | ![Retos](docs/screenshots/challenges.png) |

| Garaje multi-vehículo | Combustible y EV |
|---|---|
| ![Garaje](docs/screenshots/garage.png) | ![Combustible](docs/screenshots/fuel.png) |

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

## Conectar Supabase (siguiente paso)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Copia `.env.example` a `.env` y rellena:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
3. Aplica el esquema:
   ```bash
   npx supabase link --project-ref TU_REF
   npx supabase db push
   ```
   O pega `docs/03-modelo-datos.sql` en el SQL Editor.
4. Activa Auth (email + Apple + Google) y crea los buckets `avatars`, `vehicles`, `posts`, `receipts`.
5. El esquema ya incluye RLS, PostGIS, funciones de amistad/party, feed, combustible y QR.

El cliente está en `movil/src/lib/supabase.ts`. Si no hay variables de entorno, la app usa datos mock y sigue funcionando.

---

## Estructura

```
app de auto/
├─ docs/
│  ├─ 01-producto.md          # visión, personas, alcance, roadmap, monetización
│  ├─ 02-arquitectura.md      # stack, flujos, seguridad, costes
│  ├─ 03-modelo-datos.sql     # esquema Supabase + RLS + Realtime
│  └─ 04-checklist-mvp.md     # qué falta para lanzar
├─ movil/
│  ├─ app/                    # Expo Router (pantallas)
│  │  ├─ (tabs)/challenges.tsx # Retos + emparejamiento
│  │  ├─ challenge/[code].tsx  # Invitación a reto
│  │  └─ v/[slug].tsx          # Perfil público de vehículo
│  ├─ src/components/         # UI, mapa, QR, PTT, feed
│  ├─ src/lib/                # Supabase, QR, combustible/EV, PDF, tracking
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

- Auth y onboarding reales (email/Apple/Google) + borrado de cuenta.
- Mapbox/MapLibre + ubicación en vivo por Realtime Broadcast.
- LiveKit Cloud + Edge Function para tokens + PTT nativo.
- Retos en Supabase Realtime: invitaciones, salida/meta, progreso y anti-trampas.
- Detección de viajes con revisión/edición (unir, dividir, descartar).
- Push notifications, moderación y analítica.
- Builds iOS/Android, TestFlight/Play Internal y 20–50 beta testers.

El detalle está en [`docs/04-checklist-mvp.md`](docs/04-checklist-mvp.md).

---

## Aviso

“Wheelz” es una marca de terceros. Caravana es un nombre provisional; antes de publicar hay que verificar disponibilidad de marca y dominio. Las funciones de velocidad se limitan a estadísticas privadas: no hay leaderboards de velocidad por seguridad y por las políticas de las tiendas.
