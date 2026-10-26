# Party en tiempo real

Party es la caravana en vivo: varias personas comparten una sala, ven sus
posiciones en el mapa y coordinan por chat. La voz PTT real se conectará con
LiveKit; hasta entonces el botón de PTT es una simulación visual y háptica.

## Flujo

1. El anfitrión abre Party y crea una caravana con nombre y destino.
2. La app crea una fila en `public.parties` y otra en `public.party_members` con
   rol `host`.
3. Comparte el código de 6 caracteres o el enlace `/party/<código>`.
4. El invitado abre el enlace o introduce el código; `join_party` valida la sala,
   el aforo y la expiración, y lo añade como `member`.
5. Cada miembro publica `last_lat`, `last_lng` y `last_seen_at` cuando tiene GPS
   real. Los demás reciben los cambios por Supabase Realtime.
6. El chat usa `public.party_messages` con Realtime.
7. Al salir, se marca `left_at` y se borran las coordenadas del miembro. Si sale
   el anfitrión, la party pasa a `ended`.

## Datos

- `parties`: nombre, código, estado, destino (`destination_label`,
  `destination_lat`, `destination_lng`), inicio/fin, aforo y sala de voz.
- `party_members`: rol, `left_at`, `last_lat`, `last_lng`, `last_seen_at` y
  `is_muted`.
- `party_messages`: mensajes de hasta 500 caracteres.
- Migración: `movil/supabase/migrations/20261026080000_party_presence.sql`.

## Privacidad y RLS

- Solo el anfitrión y los miembros activos pueden leer la party, sus miembros y
  sus mensajes.
- Cada usuario solo puede insertar/editar su propia membresía; el anfitrión puede
  gestionar a los miembros.
- Solo se publican coordenadas si el permiso de ubicación está concedido y el GPS
  está en vivo; no se envía la ubicación de demo.
- El código de invitación no revela la party antes de entrar: `join_party` es una
  RPC `SECURITY DEFINER` con `EXECUTE` solo para `authenticated`.

## Cliente

- `movil/src/hooks/useParty.ts`: consulta, Realtime, crear/unirse/salir, presencia
  de ubicación y chat.
- `movil/src/components/PartyLobby.tsx`: crear party o unirse por código.
- `movil/app/(tabs)/party.tsx`: mapa, miembros, posiciones, PTT simulado y salida.
- `movil/app/party/chat.tsx`: chat de la caravana.
- `movil/app/party/[code].tsx`: invitación pública por enlace.

## Probado

- Cuenta A creó una party con destino y código.
- La membresía del host y su posición de GPS real se guardaron.
- Cuenta B abrió el enlace, se unió y apareció en el mapa y la lista.
- B envió un mensaje y quedó guardado en `party_messages`.
- B salió: `left_at` se marcó y dejó de ver la party.
- Cuentas, party, miembros y mensajes de prueba eliminados.

## Pendiente

- LiveKit Cloud + Edge Function de tokens para PTT de voz real.
- Presence explícita y reconexión de la sala para redes inestables.
- Historial de posiciones/rutas y caducidad automática de parties.
- Notificaciones push de invitación y mensajes.
- Pruebas en dispositivos con GPS real y batería en segundo plano.
