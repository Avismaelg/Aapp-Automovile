# Caravana en iPhone — lista para el lanzamiento

Todo lo que se puede preparar sin cuentas ya está hecho. Falta lo que exige la
cuenta de Apple Developer (99 US$/año) y una cuenta de Expo (gratis).

## Ya preparado (2026-11-04)

| Qué | Dónde |
|---|---|
| Identificador `app.caravana.mobile`, solo iPhone (sin iPad) | `movil/app.json` |
| Textos de permisos en español: ubicación (en uso, siempre, precisa), micrófono, cámara, fotos, movimiento | `movil/app.json` (plugins) |
| Segundo plano: ubicación, audio (walkie-talkie) y avisos remotos | `ios.infoPlist.UIBackgroundModes` |
| Sin Face ID (no se usa) y cifrado declarado como exento | `expo-secure-store`, `ios.config.usesNonExemptEncryption` |
| Firebase iOS (`GoogleService-Info.plist` con `app.caravana.mobile`) en local; en EAS llega por variable de archivo | `movil/app.config.js` |
| Frameworks estáticos para Firebase | `expo-build-properties` |
| Mapbox iOS sin token de descarga (rnmapbox 10.3) | — |
| Avisos al iPhone directo por APNs | `supabase/functions/push` (secretos `APNS_*`) |
| Módulo `motion` (detección de conducción) solo existe en Android; en iOS la app sigue sin él | `movil/modules/motion` |

## Pasos cuando tengas la cuenta de Apple

1. **Expo:** crear la cuenta en expo.dev y, en la terminal de Claude, `! npx eas-cli@latest login`.
2. **Vincular el proyecto** (lo hace Claude): `npx eas-cli@latest init` (añade el `projectId`).
3. **Variables de la compilación** (lo hace Claude):
   - `npx eas-cli@latest env:push --environment preview --path .env` (las `EXPO_PUBLIC_*`; son públicas, viajan dentro de la app).
   - `npx eas-cli@latest env:create --environment preview --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret`
   - `npx eas-cli@latest env:create --environment preview --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.plist --visibility secret`
   - Lo mismo con `--environment production` para la App Store.
4. **Registrar tu iPhone** (tú): `! npx eas-cli@latest device:create` → abre el enlace en el iPhone e instala el perfil.
5. **Primera compilación** (tú, porque Apple pide tu usuario y el código): `! npx eas-cli@latest build -p ios --profile preview`. EAS crea los certificados y el perfil; acepta que genere la clave de avisos o dale la `.p8`.
6. **Avisos:** Apple Developer → Keys → «+» → APNs → descarga `AuthKey_XXXX.p8` a Descargas y ejecuta `Caravana-iOS-Avisos.ps1` del Escritorio.
7. **Firebase:** sube la misma `.p8` en Configuración del proyecto → Cloud Messaging → app de iOS (para Crashlytics y futuros envíos por FCM).
8. **Probar en el iPhone:** voz con pantalla bloqueada, ubicación «Siempre», aviso con la app cerrada, navegación por voz.
9. **App Store:** `! npx eas-cli@latest build -p ios --profile production` y `! npx eas-cli@latest submit -p ios` (TestFlight primero).

## Riesgos a revisar en la primera compilación

- Es la primera compilación iOS: puede haber ajustes de pods (Firebase con frameworks estáticos junto a Mapbox y LiveKit).
- La revisión de Apple mira de cerca la ubicación «siempre» y el audio en segundo plano: los textos ya explican el uso (convoy, amigos y walkie-talkie).
- `NSAllowsArbitraryLoads` lo añade la plantilla de Expo; si Apple lo pregunta, se restringe a los dominios usados.
