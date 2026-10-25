# Caravana — Visión de producto (v0.1)

> **Nombre provisional:** Caravana. Se puede cambiar en una tarde; todo el código usa un único `brand.ts`.
> **Fecha:** 25/10/2026
> **Estado:** definición de producto + MVP.

---

## 1. Una frase

**Caravana es la red social del coche: registra cada viaje automáticamente, comparte la carretera con tus amigos en tiempo real, habla con ellos como por walkie-talkie, controla tu combustible y lleva tu garaje y tu QR a cualquier parte.**

---

## 2. Propuesta de valor

| Para… | Que… | Caravana le da… |
|---|---|---|
| El “car guy” que conduce con amigos | Quiere que sus rutas queden registradas y compartirlas | Tracking automático + timeline + stats + feed |
| El grupo que sale de ruta | Necesita coordinar varios coches sin perderse | Party/convoy con mapa en vivo, chat y voz PTT |
| El conductor diario | Quiere saber cuánto gasta y cómo rinde su coche | Registro de combustible, consumo, costo y PDF |
| El orgulloso de su coche | Quiere mostrar su perfil y su garage | Perfil público + QR para el vehículo |
| El club o comunidad local | Necesita un lugar para organizarse | Clubs, quedadas y rutas (fase 2) |

**Diferencia frente a Wheelz:** Wheelz clona la diversión (3D, leaderboards). Caravana clona la **utilidad** (combustible, QR, grupos) y añade la **voz en vivo**, que es el mayor dolor de una caravana real: coordinar sin soltar el teléfono.

---

## 3. Personas

### 3.1 “El líder de la caravana” — Luis, 29
- Tiene un Civic modificado; sale con 4–10 amigos casi todos los fines de semana.
- Hoy coordina por WhatsApp + ubicación en vivo de Google Maps, que se corta y no tiene voz.
- Quiere: crear una party, que todos entren con un link, verlos en el mapa, hablar con PTT y guardar el recuerdo.
- Miedo: que la app consuma batería o que se caiga la voz.

### 3.2 “El del diario” — Ana, 34
- Conduce 60 km al día; usa el coche para trabajo y familia.
- Quiere: saber consumo real, gasto mensual, historial de mantenimiento y no pensar en iniciar nada.
- Miedo: privacidad; no quiere que todo el mundo vea dónde vive.

### 3.3 “El del club” — Pedro, 41
- Organiza quedadas y rutas en su ciudad.
- Quiere: página del club, eventos, lista de asistentes, QR para los coches y un canal de voz para la ruta.
- Miedo: que la app sea otro grupo de WhatsApp más.

### 3.4 “El curioso” — Sofía, 22
- No tiene coche propio, pero sale con su novio y le gusta la cultura automovilística.
- Quiere: descubrir quedadas, ver coches, guardar rutas y compartir historias.
- Miedo: sentirse fuera de un club cerrado.

---

## 4. Alcance funcional

### 4.1 Paridad con Wheelz

| Feature de Wheelz | Caravana MVP | Fase |
|---|---|---|
| Tracking automático en segundo plano | Sí | MVP |
| Historial / timeline de trayectos | Sí | MVP |
| Stats (distancia, tiempo, media) | Sí | MVP |
| Perfiles de coche / garaje | Sí (foto) | MVP |
| Amigos + feed de actividad | Sí | MVP |
| Convoy en vivo | Sí (party) | MVP |
| Chat de texto en el convoy | Sí | MVP |
| **Chat de voz PTT** | **Sí (diferenciador)** | MVP |
| Garaje 3D (300+ coches) | Foto + icono 2D | Fase 2 |
| Leaderboards sin velocidad | Distancia/rachas | Fase 2 |
| Heatmap / mapa mundial | Sí | Fase 2 |
| Navegación turn-by-turn | Deep link a Maps/Waze | Fase 3 |
| 0–60 / telemetría | Sensores + OBD | Fase 3 |
| Live Activity en lock screen | Sí | Fase 2 |
| Etiqueta conductor/pasajero | Sí | MVP |

### 4.2 Las cuatro adiciones del usuario

#### A. Party / grupos de viaje
- Crear party con nombre, destino opcional y miembros.
- Entrar por **link de WhatsApp**, código de 6 caracteres o QR.
- Mapa en vivo con posición, rumbo, velocidad y ETA de cada miembro.
- Chat de texto y **voz push-to-talk** (mantener pulsado para hablar).
- Roles: host, miembro, “sweeper” (el que cierra el grupo).
- Estados: programada → en vivo → terminada.
- Resumen al terminar: ruta, km, paradas, fotos, participantes.
- Privacidad: party privada por defecto; ubicación solo visible para miembros.
- Límites free: hasta 5 miembros y 60 min por party.

#### B. Combustible (basado en `samilr/appFuelUsage`)
La app original calcula consumo a partir de distancia + rendimiento y genera un PDF con RD$. Caravana lo convierte en un registro real:

- Registro de cada repostaje: fecha, odómetro, litros/galones o kWh, precio, total, estación/cargador, tanque lleno.
- Cálculo automático: km/L, L/100 km, MPG, kWh/100 km, km/kWh, costo por km, costo mensual.
- Historial por vehículo y comparación entre coche, moto, EV y camión.
- Alertas de rendimiento anormal (“tu consumo subió 18 %”).
- Exportar **PDF** y CSV.
- Multi-moneda (DOP, USD, EUR, MXN, COP…).
- Unidades: km/mi, L/gal US/gal imperial.
- Recordatorio de mantenimiento por km.

#### C. QR de identidad
- Cada usuario tiene un **QR de perfil** y cada vehículo —coche, moto, EV o camión— un **QR de vehículo**.
- El QR contiene una URL (`https://caravana.app/u/luis` o `/v/abc123`), no datos personales.
- Se puede descargar como sticker PNG/PDF para pegar en el coche.
- Al escanear desde la app o la cámara del teléfono:
  - Si el perfil es público: se ve perfil, coche, rutas públicas y botón “añadir amigo”.
  - Si es privado: se ve una tarjeta mínima y solicitud de acceso.
- El dueño puede revocar el QR o cambiar su destino.
- Casos de uso: quedadas, parking, taller, club, venta del coche, accidente (tarjeta de contacto).

#### D. Retos punto A → B y emparejamiento
- Crear un reto con salida y meta, distancia y hora de inicio.
- **Modo emparejamiento:** buscar un amigo disponible o dejar que la app elija uno de la categoría.
- **Categorías separadas:** coche, moto, EV y camión; modo mixto para grupos con vehículos distintos.
- Clasificación en vivo por llegada, progreso y ETA; código/link para invitar por WhatsApp.
- En EV se tienen en cuenta las paradas de carga; en camión, los límites de peso y velocidad; en moto, el equipo completo.
- **Seguridad:** el reto mide llegada, no velocidad máxima. Sin leaderboards de velocidad, sin apuestas y con aviso de conducción responsable.
- Resultados: ganador, tiempo, distancia, categoría y revancha.

### 4.3 Red social
- Perfil con avatar, portada, bio, ciudad, coche principal y stats.
- Feed: viajes automáticos, fotos, logros y parties.
- Me gusta, comentarios, guardados.
- Clubs y quedadas (fase 2).
- Historias de 24 h (fase 3).
- Moderación: reportar, bloquear, privacidad por publicación.

---

## 5. MVP: el bucle mínimo

**Objetivo:** que un grupo de 3–5 amigos pueda instalar la app, salir de ruta, vererse, hablar, retarse y guardar el recuerdo; y que cualquiera pueda registrar su combustible o carga y mostrar su QR.

### Incluido en MVP
1. Onboarding + auth (email, Apple, Google).
2. Perfil + garaje multi-vehículo con foto (coche, moto, EV, camión).
3. QR de perfil y de cada vehículo + escáner.
4. Tracking automático + timeline + stats.
5. Amigos + feed básico.
6. Party: crear, unirse por código/link, mapa en vivo, chat, PTT.
7. Retos A → B con emparejamiento, categorías y clasificación en vivo.
8. Combustible/energía: registro, cálculo (gasolina, diésel, kWh), PDF.
9. Privacidad: público/amigos/privado; ubicación solo en party/reto activo.
10. Español e inglés; unidades métricas/imperiales.
11. Dark mode por defecto.

### Fuera del MVP (explícito)
- 300 coches 3D.
- Navegación turn-by-turn propia.
- Leaderboards globales.
- Clubs/meets completos.
- OBD-II, dashcam, seguro.
- Web pública completa (solo landing + perfil QR).
- Monetización in-app (se deja preparada).

---

## 6. Roadmap

### Fase 0 — Fundación (1–2 semanas)
- Repo, CI, Supabase, auth, design system, navegación.
- Schema de datos + RLS.
- Landing + deep links.

### Fase 1 — MVP (6–8 semanas)
- Semanas 1–2: perfil, garaje, QR, amigos.
- Semanas 3–4: tracking + timeline + stats.
- Semanas 5–6: party + mapa + chat + PTT.
- Semana 7: retos + emparejamiento + categorías de vehículo.
- Semana 8: combustible + PDF, pulido, beta TestFlight/Play.

### Fase 2 — Retención (6–8 semanas)
- Feed completo, clubs, meets, rutas.
- Leaderboards de distancia, rachas, heatmap.
- Garaje 3D (GLB) con 20–30 coches.
- Notificaciones push, Live Activity, widgets.
- Monetización: Caravana Pro.

### Fase 3 — Plataforma (3–6 meses)
- Navegación integrada, OBD-II, telemetría.
- Recomendación de rutas con IA.
- Marketplace de clubs/eventos.
- API para clubs y marcas.
- Expansión LatAm/España.

---

## 7. Monetización

| Plan | Precio objetivo | Incluye |
|---|---|---|
| Free | $0 | Tracking, 90 días de historial, 2 vehículos, parties de hasta 5, retos con amigos, QR básico, combustible |
| Pro | $19.99–29.99/año (LatAm) · $29.99–39.99 (España/EE. UU.) | Historial ilimitado, coches ilimitados, stats avanzadas, PDF sin marca, heatmap, parties ilimitadas, 3D |
| Crew | $49.99/año | Pro para hasta 10 miembros de un club + página de club |
| B2B | A medida | Clubs, concesionarios, escuelas, seguros |

**Regla:** el social (amigos, party, chat) es gratis. Se cobra por memoria, personalización y herramientas.

---

## 8. Métricas clave

- **Activación:** % que registra un trayecto en las primeras 24 h.
- **Calidad:** % de trayectos detectados sin edición; % fusionados.
- **Social:** % con ≥1 amigo; % que crea/entra en una party en 30 días.
- **Retención:** D7, D30; D30 con amigo vs sin amigo.
- **Voz:** % de parties con PTT activo; minutos por party.
- **Retos:** % que crea/acepta un reto; retos por usuario/mes; revancha.
- **Categorías:** mezcla de coche/moto/EV/camión entre usuarios activos.
- **Combustible:** % que registra ≥2 repostajes o cargas; retención de esos usuarios.
- **QR:** escaneos por usuario; conversión escaneo → follow.
- **Negocio:** free→Pro, churn anual, CAC por canal.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Batería: tracking + mapa + voz | Tracking adaptativo, geofencing, PTT bajo demanda, modo ahorro |
| Privacidad / stalking | Ubicación solo en party, por invitación, expira al terminar, bloquear/reportar |
| Voz inestable en carretera | LiveKit con reconexión, Opus, modo audio-only, fallback a WhatsApp |
| Cold start social | Parties por link, clubs, eventos locales; no feed global al inicio |
| 3D caro | Foto + 2D en MVP; 3D por packs descargables |
| Legal (velocidad/carreras) | Retos por llegada, sin leaderboards de velocidad, sin apuestas; disclaimers, verificación de llegada y moderación |
| Anti-trampas en retos | Geocerca de meta, revisión de saltos de GPS, velocidad imposible, ubicación simulada, reportes |
| Equidad entre vehículos | Categorías separadas + modo mixto informado; nunca comparar velocidad máxima |
| App Store (background location) | Justificación clara, video demo, permisos granulares |
| Coste de mapas/voz | MapLibre/OSM o Mapbox free tier; LiveKit Cloud free tier; límites |

---

## 10. Decisiones pendientes

1. Nombre definitivo y dominio.
2. Mercado inicial: República Dominicana, LatAm, España o EE. UU.
3. iOS primero, Android primero o ambos.
4. Cuentas: Apple Developer, Google Play, Supabase, LiveKit, Mapbox.
5. Si el usuario quiere 3D desde el día 1 o acepta foto + 2D en MVP.
