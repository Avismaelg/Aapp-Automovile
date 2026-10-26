# Voz real con LiveKit y 3 canales por party

El PTT de Caravana usa **LiveKit** para audio en tiempo real. Cada party tiene
tres canales de voz fijos:

| Canal | Slug | Uso |
| --- | --- | --- |
| **Convoy** | `convoy` | Coordinación general de la caravana. |
| **Ruta** | `route` | Tráfico, paradas, navegación y avisos. |
| **Charla** | `chat` | Conversación distendida. |

El usuario elige un canal y su selección se guarda en
`party_members.voice_channel_slug`. Cada canal es una sala LiveKit distinta:
`<voice_room>_<slug>`. Al cambiar de canal, el cliente pide un token nuevo y
reconecta el micrófono.

## Base de datos

Migración:
`movil/supabase/migrations/20261026090000_party_voice_channels.sql`.

- `party_voice_channels`: tres filas por party (`convoy`, `route`, `chat`).
- El trigger `parties_create_voice_channels` las crea automáticamente al insertar
  una party.
- `party_members.voice_channel_slug` guarda el canal activo del miembro.
- RLS: solo el anfitrión y los miembros activos pueden leer los canales.

## Edge Function de tokens

Archivo: `movil/supabase/functions/livekit-token/index.ts`.

La función:

1. Valida la sesión de Supabase.
2. Comprueba que el usuario sea miembro activo de la party.
3. Comprueba que el canal exista y sea `convoy`, `route` o `chat`.
4. Emite un token LiveKit de 2 horas con permiso para entrar a la sala, publicar
   micrófono y escuchar.
5. Devuelve `token`, `url`, `roomName` y el canal.

La función ya está desplegada en el proyecto, pero **sin secretos de LiveKit**
responde `503` con un mensaje claro. El cliente muestra “Sin configurar” y no
finge que hay voz.

### Configurar secretos

En LiveKit Cloud crea un proyecto y copia la URL WebSocket, la API key y el
secreto. Después:

```bash
cd movil
npx supabase login
npx supabase secrets set \
  LIVEKIT_URL=wss://tu-proyecto.livekit.cloud \
  LIVEKIT_API_KEY=... \
  LIVEKIT_API_SECRET=... \
  --project-ref ecmqmgpruxclmpnnpgzv
npx supabase functions deploy livekit-token --project-ref ecmqmgpruxclmpnnpgzv
```

No se debe poner `LIVEKIT_API_SECRET` en `EXPO_PUBLIC_*` ni en el cliente.

## Cliente

- `livekit-client`: cliente WebRTC.
- `@livekit/react-native`, `@livekit/react-native-webrtc` y el plugin de Expo:
  soporte nativo.
- `src/lib/livekit.ts` / `livekit.web.ts`: inicialización por plataforma.
- `src/hooks/useVoiceRoom.ts`: pide token, conecta la sala, escucha participantes
  y activa/desactiva el micrófono.
- `src/lib/party.ts`: los tres canales.
- `app/(tabs)/party.tsx`: selector de canal, estado de voz y PTT.
- `app/party/chat.tsx`: chat escrito (independiente de los canales de voz).

El micrófono permanece **cerrado** hasta que se mantiene pulsado el botón PTT.
Al soltarlo se despublica. Al cambiar de canal o salir de la party se desconecta
la sala y se cierra la sesión de audio.

## Build

LiveKit usa WebRTC nativo, así que **Expo Go no es suficiente**:

```bash
cd movil
npx expo prebuild
npx expo run:android
# o
npx expo run:ios
```

También se puede usar EAS Build con un perfil de desarrollo. La app ya tiene:

- `NSMicrophoneUsageDescription` en iOS.
- `RECORD_AUDIO` en Android.
- `UIBackgroundModes: audio` en iOS.
- Plugins `@livekit/react-native-expo-plugin` y
  `@config-plugins/react-native-webrtc`.

## Probado

- El trigger crea **3 canales** al insertar una party.
- La UI muestra Convoy, Ruta y Charla con contador por canal.
- Cambiar de canal persiste `voice_channel_slug`.
- La Edge Function está desplegada y activa.
- Sin secretos, la app muestra el error controlado y no activa el micrófono.
- TypeScript, ESLint y Expo Doctor pasan.

## Pendiente

- Configurar los secretos de LiveKit y probar audio real entre dos dispositivos.
- Validar permisos de micrófono, eco, cancelación de ruido y audio de auricular.
- Audio en segundo plano/CallKit y servicio en primer plano Android.
- Notificaciones push cuando alguien entra al canal o empieza a hablar.
- Moderación: mute por anfitrión, expulsión y límite de canales.
