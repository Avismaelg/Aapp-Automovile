# Party en tiempo real

Party es la caravana en vivo: varias personas comparten una sala, ven sus
posiciones en el mapa, coordinan por chat y hablan por PTT en uno de los tres
canales de voz. La voz real usa LiveKit; sin secretos configurados la app muestra
un error controlado y no activa el micrófono.

## Canales de voz

Cada party crea automáticamente tres canales:

- **Convoy** (`convoy`): coordinación general.
- **Ruta** (`route`): tráfico, paradas y navegación.
- **Charla** (`chat`): conversación distendida.

El canal activo se guarda en `party_members.voice_channel_slug`. Al cambiar de
canal, el cliente reconecta LiveKit a la sala `<voice_room>_<slug>`.

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
- `party_members`: rol, `left_at`, `last_lat`, `last_lng`, `last_seen_at`,
  `is_muted` y `voice_channel_slug`.
- `party_voice_channels`: tres canales fijos por party.
- `party_messages`: mensajes de hasta 500 caracteres.
- Migraciones: `20261026080000_party_presence.sql` y
  `20261026090000_party_voice_channels.sql`.
- Voz: `supabase/functions/livekit-token/index.ts` y
  [`12-livekit-voz.md`](12-livekit-voz.md).

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
  de ubicación, cambio de canal y chat.
- `movil/src/hooks/useVoiceRoom.ts`: token, conexión LiveKit y micrófono PTT.
- `movil/src/components/PartyLobby.tsx`: crear party o unirse por código.
- `movil/app/(tabs)/party.tsx`: mapa, miembros, 3 canales, PTT real y salida.
- `movil/app/party/chat.tsx`: chat de la caravana.
- `movil/app/party/[code].tsx`: invitación por enlace.

## Probado

- Cuenta A creó una party con destino y código.
- La membresía del host y su posición de GPS real se guardaron.
- Cuenta B abrió el enlace, se unió y apareció en el mapa y la lista.
- B envió un mensaje y quedó guardado en `party_messages`.
- B salió: `left_at` se marcó y dejó de ver la party.
- El trigger de party creó los 3 canales y la UI los muestra.
- Dos cuentas reales: A en Ruta y B en Convoy mostraron 1/1; al cambiar B
  a Ruta, la UI mostró 0/2 y la base guardó `route` para ambos.
- La Edge Function `livekit-token` está desplegada; sin secretos devuelve error
  controlado y no se activa el micrófono.
- Cuentas, party, miembros y mensajes de prueba eliminados.

## Pendiente

- Configurar secretos de LiveKit y probar audio real entre dos dispositivos.
- Presence explícita y reconexión de la sala para redes inestables.
- Historial de posiciones/rutas y caducidad automática de parties.
- Notificaciones push de invitación y mensajes.
- Pruebas en dispositivos con GPS real y batería en segundo plano.
