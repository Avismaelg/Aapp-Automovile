# Caravana — Autenticación y cuentas

> Estado: flujo de email/contraseña implementado y probado contra el proyecto Supabase `ecmqmgpruxclmpnnpgzv`. El trigger crea el perfil automáticamente y Auth funciona de extremo a extremo. Apple/Google y recuperación de contraseña siguen pendientes.

---

## 1. Qué incluye

- Pantalla de bienvenida con propuesta de valor.
- Registro con nombre, `@usuario`, correo y contraseña.
- Inicio de sesión con correo y contraseña.
- Validación de formularios en español y mensajes de error legibles.
- Sesión persistida con Supabase Auth y `AsyncStorage`.
- Perfil automático creado por el trigger `handle_new_user`.
- Protección de las pestañas con `Stack.Protected` de Expo Router.
- Enlaces públicos (`/u`, `/v`, `/challenge`) accesibles sin cuenta.
- Modo demo completo para revisar la app sin claves.
- Cierre de sesión desde Perfil → Cuenta.

El modo demo no es una cuenta de Supabase: usa los datos de `src/data/mock.ts` y guarda solo en el dispositivo.

---

## 2. Archivos principales

| Archivo | Responsabilidad |
|---|---|
| `movil/app/(auth)/welcome.tsx` | Bienvenida, creación de cuenta, login y entrada a demo |
| `movil/app/(auth)/sign-in.tsx` | Formulario de inicio de sesión |
| `movil/app/(auth)/sign-up.tsx` | Registro y pantalla de confirmación por correo |
| `movil/app/(auth)/_layout.tsx` | Stack del grupo de autenticación |
| `movil/src/store/auth.ts` | Estado global, llamadas a Supabase, sesión y modo demo |
| `movil/src/hooks/useCurrentUser.ts` | Perfil del piloto conectado, con fallback a demo |
| `movil/src/components/auth.tsx` | Marca, avisos y layout compartido de formularios |
| `movil/src/lib/supabase.ts` | Cliente Supabase y persistencia de sesión |
| `movil/app/_layout.tsx` | Arranque, splash y rutas protegidas |
| `docs/03-modelo-datos.sql` | Trigger de perfil y validación de `username` |

---

## 3. Cómo activar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Copia `movil/.env.example` a `movil/.env` y rellena:

   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://TU_REF.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

3. Aplica la migración:

   ```bash
   cd movil
   npx supabase link --project-ref TU_REF
   npx supabase db push
   ```

   También puedes pegar `docs/03-modelo-datos.sql` en el SQL Editor.

4. En **Authentication → Providers**, activa **Email**.
5. Para el MVP, la vía más simple es desactivar **Confirm email** en
   **Authentication → Sign In / Providers**. Así el registro devuelve sesión
   inmediata y no hay que manejar enlaces profundos.
6. Si prefieres mantener la confirmación:
   - En web, configura **Site URL** con la URL de la app (por ejemplo
     `http://localhost:8081` en desarrollo o el dominio final).
   - El cliente ya detecta la sesión en la URL web.
   - En iOS/Android el deep link de confirmación aún queda pendiente; hasta
     entonces, desactiva la confirmación o confirma desde el panel.
7. Reinicia Metro después de cambiar `.env`:

   ```bash
   npx expo start --clear
   ```

> Las variables `EXPO_PUBLIC_*` forman parte del bundle. Nunca pongas la
> `service_role` key ni secretos en ellas.

---

## 4. Flujo de arranque

```
¿Hay claves de Supabase?
├─ No → ¿El usuario ya salió del demo?
│       ├─ No → entra directo al modo demo
│       └─ Sí → bienvenida con opción de demo
└─ Sí → ¿Hay sesión de Supabase?
        ├─ Sí → carga el perfil y entra a las pestañas
        └─ No → ¿El usuario eligió demo?
                ├─ Sí → mantiene el modo demo
                └─ No → bienvenida / login / registro
```

La marca `caravana.auth.demo-mode` en `AsyncStorage` distingue entre “nunca
salió del demo” (`null`), “modo demo activo” (`1`) y “el usuario cerró sesión”
(`0`). El modo demo se conserva aunque haya claves de Supabase, salvo que exista
una sesión real guardada.

---

## 5. Registro y perfil

El registro envía estos metadatos a Supabase:

```ts
{
  display_name: 'Nombre visible',
  username: 'usuario_elegido'
}
```

El trigger `public.handle_new_user()`:

- usa el `username` elegido si cumple `^[a-z0-9_]{3,24}$` y está libre;
- genera uno automáticamente si hay conflicto o formato inválido;
- limita el nombre visible a 60 caracteres;
- crea el perfil con `qr_slug` aleatorio.

La app consulta `profiles` después del login para mostrar el nombre, `@usuario`
y avatar reales. Si la consulta falla, usa los metadatos de Auth como fallback.

---

## 6. Validaciones de la app

- Nombre: mínimo 2 caracteres, máximo 60.
- Usuario: 3–24 caracteres, solo minúsculas, números y `_`.
- Correo: formato básico `texto@dominio.tld`.
- Contraseña: mínimo 8 caracteres.
- Confirmación de contraseña obligatoria.
- El botón de crear cuenta se desactiva si falta un campo o si Supabase no está
  configurado.

Supabase puede imponer requisitos adicionales según la configuración del
proyecto; los errores más comunes se traducen en `src/store/auth.ts`.

---

## 7. Seguridad y privacidad

- RLS está activo en `profiles`, `vehicles`, `fuel_logs`, `challenges` y el resto
  del esquema.
- El cliente solo usa la `anon key`.
- Las contraseñas nunca pasan por código propio: las gestiona Supabase Auth.
- El QR público no contiene correo, teléfono ni ubicación.
- El tracking y la ubicación en vivo son independientes del login; la ubicación
  solo se comparte dentro de una party.
- Las rutas públicas `/u/:username`, `/v/:slug` y `/challenge/:code` no exponen
  datos privados.
- Un perfil desconocido muestra un estado vacío, no el perfil del usuario local.

---

## 8. Pendiente para producción

- Recuperación de contraseña (“olvidé mi contraseña”).
- Confirmación por correo con deep link nativo.
- Inicio de sesión con Apple y Google.
- Subida y recorte de avatar.
- Edición real de perfil (nombre, bio, ciudad, privacidad).
- Borrado de cuenta in-app y borrado de datos asociados.
- Rate limiting y captcha en Auth.
- Verificación de edad y términos aceptados.
- Conectar edición de perfil, feed, amigos y retos a datos reales. El garaje y
  los repostajes ya cuentan con capa de lectura/escritura Supabase; el resto de
  pantallas sigue usando mocks.

---

## 9. Comprobaciones

```bash
cd movil
npx tsc --noEmit
npx eslint .
npx expo-doctor
npx expo export --platform web
```

Prueba manual mínima:

1. Sin `.env`: la app entra en demo.
2. Perfil → Cuenta → Salir del modo demo.
3. Bienvenida → Crear mi cuenta / Ya tengo cuenta.
4. “Explorar en modo demo” vuelve a las pestañas.
5. Recarga: la sesión demo se conserva.
6. Con claves: crear cuenta, cerrar sesión, volver a entrar.
7. Abrir `/u/ana.drives` en una ventana privada: debe verse sin login.
