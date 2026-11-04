# Seguridad y privacidad — cómo está protegida Caravana

Estado en la rama `fix/production-readiness` (2026-11-04). Las migraciones de
seguridad están **escritas y probadas de forma estática, pero no aplicadas**:
ver `PRUEBAS-PRODUCCION.md` y `CHECKLIST-LANZAMIENTO.md`.

## Principios

1. **La base de datos decide**, no la app: cada regla vive en RLS, permisos por
   columna, triggers o funciones `security definer`. Un cliente modificado no
   puede saltársela.
2. **Mínimo privilegio:** `anon` y `authenticated` solo tienen lo que la app
   usa; lo sensible va por funciones con comprobaciones.
3. **Secretos solo en el servidor** (secretos de Supabase); la app lleva solo
   claves públicas (`EXPO_PUBLIC_*`).

## Ubicación: tres estados

| Estado | Quién te ve | Cómo se activa | Cómo se revoca |
|---|---|---|---|
| Privada (por defecto) | Nadie | — | — |
| Convoy | Miembros de tu convoy, mientras sigas en él | Unirte o crear un convoy | Salir; expulsión; el convoy se borra a las 24 h |
| Amigos | Tus amigos (amistad aceptada por los dos, sin bloqueos) | «Compartir con amigos» (aviso único o Perfil); **desactivado por defecto** | El ojo del mapa o Perfil: se deja de enviar y se **borra tu última posición** |

- Al cerrar sesión se borra la configuración de envío y se apaga el servicio
  de segundo plano (`app/_layout.tsx`); el token de avisos se borra antes.
- Retención: posición de convoy hasta salir o 24 h; posición para amigos hasta
  revocar (la última posición se borra al revocar); posiciones de más de 12 h
  no se muestran (`FRIEND_LOCATION_TTL_MS`). Viajes: solo en el teléfono.
- Antigüedad: más de 2 min sin posición = «Hace X min», en gris; nunca «en vivo».

## Controles por área

| Área | Control | Dónde |
|---|---|---|
| Convoys | Alta solo por `join_party` / `accept_party_invite` (salvo el anfitrión en su convoy); el miembro solo cambia posición, progreso, canal y su salida; rol por `set_party_member_role`; expulsión con `kicked_at`; límite contado con el convoy bloqueado | `20261104120000_party_members_hardening.sql` |
| Amistades | Solo el destinatario responde; solo pendiente → aceptada/rechazada; ids inmutables; nunca con bloqueo | `20261104121000_friendships_hardening.sql` |
| Datos privados | La matrícula y `home_location` no se conceden por columna; `my_vehicle_plates()` para el dueño. El odómetro se ve en vehículos públicos (ficha de venta) | `20261104122000_private_columns.sql` |
| Seguridad vial | Sin clasificaciones ni récords de velocidad; `speed_records` solo del dueño y sin altas nuevas | `20261104123000_no_public_speed.sql`, `app/records.tsx` |
| Retos | Inscribe solo el anfitrión; el participante solo acepta/rechaza; la llegada se comprueba contra la meta, precisión ≤ 50 m y tiempo mínimo; «verificada» o «autodeclarada» | `20261104124000_challenge_integrity.sql` |
| Voz | Token de 15 min solo para miembros de convoys vigentes; al salir o ser expulsado se echa de las salas (`livekit-revoke`) | `livekit-token`, `livekit-revoke`, `20261104125000_voice_revoke.sql` |
| Borrado de cuenta | JWT del usuario; borrado de Auth en cascada; archivos con reintentos y cola `private.storage_cleanup` (solo bucket y ruta); estado `partial` si queda algo | `delete-account`, `20261104126000_storage_cleanup_queue.sql` |
| Avisos | `push` solo con secreto compartido (la llaman triggers); tokens por usuario con RLS | `push`, `20261104100000_push_notifications.sql` |
| Búsqueda y rutas | Clave de Google solo en el servidor; cupo diario global y por usuario | `places`, `routes` |

## Lo que sigue abierto

- Las verificaciones GPS de los retos **no son infalibles**: un GPS falso puede
  engañarlas. «Verificada» significa coherente, no probada.
- Revisión legal de la política de privacidad (`politica-privacidad-borrador.md`).
- Datos antiguos de `speed_records`: privados pero conservados; borrarlos
  necesita tu autorización.
- Photon y Nominatim públicos siguen como respaldo de búsqueda (Google es el
  principal): revisar su política de uso antes de crecer.
