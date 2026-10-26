# Caravana — Checklist para pasar del prototipo al MVP

> Estado: prototipo visual funcional. Este documento es la lista de trabajo para una beta cerrada con 20–50 usuarios.

---

## 1. Lo que ya existe en el repo

- App Expo/React Native con Expo Router y TypeScript.
- Design system dark, iconos y splash generados.
- Pantallas: Bienvenida, Registro, Login, Inicio, Party, Retos, Garaje, Consumo, Perfil, Escáner, invitación, perfil público y perfil de vehículo.
- Autenticación email/contraseña con Supabase: validación, sesión persistida, rutas protegidas y modo demo local.
- Perfil editable en Supabase (nombre, bio, ciudad, privacidad) y perfil público con vehículos públicos.
- Amigos reales: búsqueda, solicitudes, aceptar/rechazar, eliminar y estado en el perfil público.
- Feed de texto real con visibilidad y likes en Supabase; publicar desde Home. Faltan fotos, comentarios y moderación.
- Retos punto A → B: modo programado 1v1 y **reto al momento con 2+ pilotos**, categorías coche/moto/EV/camión y simulación local.
- Modo conducción con party, PTT grande, reto y diseño horizontal/vertical.
- Ficha de vehículo con datos técnicos, mantenimientos reales en Supabase e historial de venta en PDF.
- Party con mapa real de OpenStreetMap y ubicación GPS del usuario en vivo (web y móvil).
- Garaje multi-vehículo: coche, moto, EV y camión, cada uno con su QR.
- Calculadora de combustible/energía + PDF + historial local (gasolina, diésel y EV).
- QR real de perfil/coche/moto/EV/camión y escáner con cámara.
- Servicio base de tracking en segundo plano (`expo-location` + `expo-task-manager`).
- Esquema Supabase completo con RLS, PostGIS, funciones y Realtime, aplicado al proyecto `ecmqmgpruxclmpnnpgzv`.
- Auth email probada de extremo a extremo; trigger de perfil, alta de vehículo y repostaje reales verificados.
- Cliente Supabase opcional (la app corre con mocks si no hay `.env`).
- Lint, typecheck y Expo Doctor en verde.

---

## 2. Bloqueadores P0 (sin esto no hay beta)

| # | Tarea | Responsable | Estimación |
|---|---|---|---|
| 1 | ✅ Crear proyecto Supabase y aplicar migración | Dev | Hecho |
| 2 | ✅ Auth email y perfil editable probados; 🟡 añadir Apple/Google, recuperación, avatar y borrado de cuenta | Dev | 3–4 días |
| 3 | 🟡 Perfil, amigos, garaje, combustible, mantenimiento y feed de texto reales; faltan fotos/comentarios y retos en Supabase | Dev | 4–5 días |
| 4 | Desplegar GraphHopper, publicar miembros por Realtime y elegir proveedor de teselas para producción | Dev | 4–5 días |
| 5 | LiveKit Cloud + Edge Function de tokens + PTT nativo | Dev | 4–6 días |
| 6 | Detección de viajes con revisión (unir/dividir/descartar) | Dev | 4–5 días |
| 7 | Retos en Realtime: invitación, aceptación, salida/meta, progreso y anti-trampas | Dev | 5–7 días |
| 8 | Builds de desarrollo y beta (EAS) en Android/iOS | Dev | 2–3 días |
| 9 | Pruebas de campo: batería, túneles, reconexión y voz | Dev + testers | 1 semana |
| 10 | Privacidad, términos y política de datos | Fundador/legal | 1–2 días |
| 11 | Moderación mínima (reportar/bloquear) y rate limits | Dev | 2–3 días |
| 12 | Revisión de seguridad del modo retos y textos de conducción responsable | Fundador/legal | 1 día |

**Estimación realista:** 6–8 semanas para una beta sólida con un desarrollador a tiempo completo.

---

## 3. Cuentas y claves que necesitas crear

| Servicio | Plan inicial | Para qué | Coste |
|---|---|---|---|
| Supabase | Free → Pro | Auth, Postgres, Realtime, Storage | $0 → $25/mes |
| LiveKit Cloud | Free → Scale | Salas de voz y PTT | $0 → variable |
| Mapbox | Free | Mapa oscuro, rutas, geocoding | $0 (50k MAU) |
| Apple Developer | Anual | TestFlight/App Store | $99/año |
| Google Play | Único | Play Console | $25 |
| EAS (Expo) | Free/Starter | Builds iOS/Android | $0 → $99/mes |
| Dominio + email | Anual | `caravana.app`, enlaces QR | ~$20–50/año |

**Alternativa sin coste de mapas:** MapLibre + OpenStreetMap (más trabajo de estilo y geocoding).

---

## 4. Orden de implementación recomendado

### Semana 1 — Datos reales
- Supabase + migración + buckets.
- Probar Auth email en un proyecto real; activar Apple/Google y recuperación.
- Perfil editable, QR y subida de fotos.
- Garaje y repostajes ya usan hooks con Supabase (`useGarage`, `useFuelLogs`).
- Pasar feed y retos a TanStack Query + Supabase Realtime.

### Semana 2 — Social
- Amigos (solicitudes/aceptar/bloquear).
- Feed con viajes, fotos y reacciones.
- Perfil público por QR + deep links.

### Semana 3 — Tracking
- Integrar `startTracking`/`stopTracking` en la UI.
- Pantalla “Viaje detectado” con mapa y opciones.
- Post-proceso: filtrar ruido, unir paradas < 10 min, dividir huecos.
- Subida a Supabase y timeline.

### Semana 4 — Party + mapa
- Base OSM/Leaflet ya integrada.
- Crear/unirse por código o link.
- Publicar posiciones reales cada 3–5 s por Supabase Realtime; Presence para miembros.
- Ruta por carretera (OSRM/Valhalla) y proveedor de teselas para producción.
- Chat de texto y persistencia de última ubicación.

### Semana 5 — Voz
- LiveKit Cloud + Edge Function `livekit-token`.
- Permisos de micrófono y audio en segundo plano.
- PTT: unirse muteado, activar micrófono al pulsar, desactivar al soltar.
- Manejo de interrupciones (llamadas, Bluetooth, CarPlay).

### Semana 6 — Retos + combustible + beta
- Retos: invitaciones, aceptación, salida, meta y clasificación en Realtime.
- Verificación de llegada por geocerca + revisión de fraude (velocidad, saltos, ubicación falsa).
- Categorías separadas para coche, moto, EV y camión; modo mixto con aviso.
- Persistencia de repostajes/cargas y PDF con datos reales.
- Push notifications, analítica y Sentry.
- Builds, TestFlight/Play Internal, 20–50 testers.

### Semanas 7–8 — Pulido
- Batería, reconexión, estados vacíos, errores.
- ASO, landing, video demo, revisión de tiendas.
- Lanzamiento blando en una ciudad.

---

## 5. Pruebas críticas antes de publicar

- [ ] Ruta de 2 h con 4 coches y voz activa: sin cortes > 5 s.
- [ ] Túnel / zona sin señal: la ubicación se recupera al volver.
- [ ] Atasco de 15 min: el viaje no se divide.
- [ ] Avión/tren: no se registra un viaje falso.
- [ ] Teléfono bloqueado 30 min: el tracking sigue y la batería baja < 10 %.
- [ ] Android gama media (Xiaomi/Samsung) con ahorro de batería agresivo.
- [ ] Registro, cierre de sesión y login conservan el perfil correcto.
- [ ] Enlace de perfil desconocido no muestra datos de otra cuenta.
- [ ] Enlaces públicos `/u`, `/v` y `/challenge` abren sin sesión.
- [ ] Escaneo de QR con la cámara del sistema y con la app.
- [ ] Perfil privado: el QR no filtra ubicación ni teléfono.
- [ ] Repostaje parcial + lleno: el consumo se calcula bien.
- [ ] Carga EV: kWh/100 km y costo por kWh correctos.
- [ ] Reto al momento con 3+ pilotos: sala, timer, clasificación y finalización.
- [ ] Reto entre coche, moto, EV y camión: cada categoría tiene su clasificación.
- [ ] Reto mixto: aviso de seguridad y llegada verificada, sin ranking de velocidad.
- [ ] Ficha de venta: PDF con datos, mantenimientos y repostajes; sin placa ni ubicación.
- [ ] Modo conducción en horizontal y vertical, sin controles pequeños.
- [ ] Mapa OSM: permiso concedido, marcador “Tú” y actualización cada 5 s.
- [ ] Mapa OSM: permiso denegado y fallback de demo con reintento.
- [ ] CarPlay Simulator y Android Auto DHU muestran la pantalla de Caravana.
- [ ] Cuenta eliminada: se borran perfil, viajes, fotos y tokens.

---

## 6. Cumplimiento y tiendas

- [ ] Justificación de ubicación en segundo plano (video demo para Apple).
- [ ] Permiso de ubicación “Always” explicado antes del diálogo del sistema.
- [ ] Borrado de cuenta in-app.
- [ ] Política de privacidad y términos.
- [ ] Edad mínima y contenido generado por usuarios (moderación).
- [ ] Sin leaderboards de velocidad ni fomento de carreras.
- [ ] `NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes`, `FOREGROUND_SERVICE_LOCATION`.
- [ ] Icono de notificación monocromo y canal de Android.
- [ ] Revisión de dependencias (`npm audit`) y secretos fuera del repo.

---

## 7. Métricas del beta

- Activación: % que registra un viaje en 24 h.
- Calidad: % de viajes sin editar; % unidos/descartados.
- Social: % con ≥1 amigo; % que entra en una party en 30 días.
- Voz: % de parties con PTT; minutos por party.
- Combustible: % con ≥2 repostajes.
- QR: escaneos por usuario; escaneo → follow.
- Retención D7/D30; batería percibida; crashes.

---

## 8. Limitaciones conocidas del prototipo

- El login email/contraseña está implementado, pero aún no se ha probado contra un proyecto Supabase real.
- Garaje y repostajes ya leen/escriben Supabase en cuentas reales; perfil, feed, amigos y retos siguen usando mocks.
- El garaje demo se conserva en el dispositivo; los repostajes demo solo viven mientras la pantalla está abierta.
- El mapa de Party es real (OSM/Leaflet) y usa el GPS del usuario; los otros miembros y la ruta son de demo hasta conectar Realtime y un motor de ruteo.
- El PTT es una simulación visual; no transmite audio.
- El tracking está conectado a la UI en Home/Perfil, pero no sube datos a Supabase.
- Los retos son una simulación local; no hay invitaciones ni Realtime reales.
- El QR apunta a `caravana.app`, que aún no está desplegado.
- El Modo conducción es una pantalla móvil; la proyección nativa CarPlay/Android Auto requiere entitlement, aprobación y build nativo.
- Los mantenimientos ya se guardan en Supabase; faltan edición, borrado y adjuntar facturas.
- El PDF funciona en nativo/web, pero el historial no persiste entre sesiones.
- No hay push, moderación ni analítica.
- Supabase reporta advisors pendientes: funciones `SECURITY DEFINER` expuestas por RPC y mejoras de índices/RLS. No bloquean el MVP, pero deben revisarse antes de producción.

---

## 9. Siguiente acción inmediata

1. Decidir nombre/dominio y mercado inicial.
2. Crear Supabase, LiveKit y Mapbox.
3. Aplicar la migración, configurar Email Auth y probar registro/login reales.
4. Probar alta de vehículo y guardado de repostaje contra Supabase.
5. Probar la app en un Android real con development build.
6. Definir categoría y solicitar entitlement para CarPlay/Android Auto.
5. Cerrar la primera party de prueba con 3 coches.
