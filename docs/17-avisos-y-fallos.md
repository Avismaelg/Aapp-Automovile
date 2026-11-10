# Avisos push y registro de fallos (Firebase)

MAPA-24: los avisos llegan con la app cerrada. Crashlytics recoge los cierres
de la app sin esperar a que alguien los cuente.

## Avisos

| Suceso | Trigger | Destinatario | Al tocar |
|---|---|---|---|
| Invitación a un convoy | `party_invites` insert (`pending`) | invitado | mapa (sale la invitación) |
| Reto | `challenge_participants` insert (`invited`) | retado | Retos |
| Solicitud de amistad | `friendships` insert (`pending`) | destinatario | perfil de quien la envía |

Flujo:

1. La app registra el token del teléfono al entrar (`src/lib/push.ts` →
   RPC `register_push_token`; tabla `push_tokens` con RLS por usuario). Al cerrar
   sesión se borra.
2. El trigger llama a `private.send_push`, que hace `net.http_post` (pg_net) a la
   Edge Function `push` con el secreto compartido (`private.push_config`, sin
   acceso por la API).
3. `push` arma el texto y envía:
   - **Android:** FCM HTTP v1 con la cuenta de servicio (`FIREBASE_SERVICE_ACCOUNT`).
   - **iPhone:** APNs directo con la clave `.p8` (`APNS_KEY_ID`, `APNS_TEAM_ID`,
     `APNS_PRIVATE_KEY`).
   - Borra los tokens que el servicio da por caducados.

El aviso local que ya existía (`src/lib/background-alerts.ts`, sondeo en segundo
plano) usa la misma etiqueta que el push: si llegan los dos, Android muestra uno.

En Android los avisos usan `expo-notifications` (que recibe FCM) y no
`@react-native-firebase/messaging`: los dos registran un servicio de mensajería y
solo uno recibe.

## Crashlytics

`src/lib/crashlytics.ts` se carga en diferido (sin Firebase en web y en Jest no
hace nada). Registra los cierres nativos y de JavaScript y todo lo que pasa por
`recordError` (`src/lib/error-log.ts`). Solo se envía el id de la cuenta, nunca
el correo ni el nombre.

## Puesta en marcha

- Archivos: `movil/google-services.json` y `movil/GoogleService-Info.plist`
  (ignorados por git; en EAS, variables de tipo archivo, ver `app.config.js`).
- Servidor: migraciones `20261104100000_push_notifications.sql` y
  `20261104110000_restore_private_usage.sql`, función `push` desplegada con
  `verify_jwt = false` (la protege el secreto compartido).
- Probado el 2026-11-04 en Android: aviso de reto recibido con la app cerrada.
