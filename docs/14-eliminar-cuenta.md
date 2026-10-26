# Eliminar cuenta y datos

La app permite eliminar una cuenta real desde Perfil → **Eliminar cuenta y
datos**. Es un requisito habitual de App Store y Google Play.

## Flujo

1. El usuario abre la pantalla de confirmación.
2. Debe escribir exactamente `ELIMINAR`.
3. El cliente invoca la Edge Function `delete-account` con su JWT.
4. La función valida la sesión y usa la `service_role` solo en el servidor.
5. Borra las imágenes de `storage.objects` del bucket `posts` asociadas a sus
   publicaciones.
6. Borra el usuario de `auth.users`. Las tablas de Caravana tienen `on delete
   cascade`, así que perfil, vehículos, posts, comentarios, parties, retos,
   amistades y mantenimientos se eliminan.
7. El cliente limpia la sesión local sin llamar a `/logout` (la cuenta ya no
   existe y ese endpoint devolvería 403) y vuelve a bienvenida.

## Seguridad

- `delete-account` está desplegada con `verify_jwt = true`.
- La `service_role` nunca llega al cliente.
- La función solo puede borrar el usuario autenticado en la petición.
- El cliente no puede borrar otras cuentas.
- Si el usuario no tiene sesión, la función responde 401.

## Cliente

- `app/account/delete.tsx`: aviso, lista de datos borrados y confirmación.
- `src/hooks/useDeleteAccount.ts`: invoca la función y limpia Query Client.
- `src/store/auth.ts`: `signOutLocal` cierra la sesión sin llamar a `/logout`.
- `app/(tabs)/profile.tsx`: acceso desde la sección Cuenta.

## Probado

- Función invocada directamente: `200 { ok: true }` y usuario eliminado.
- Flujo completo desde la app: confirmación `ELIMINAR`, redirección a
  bienvenida y usuario eliminado de `auth.users`.
- Verificado que **no hay error 403** en consola al cerrar la sesión local.
- Cuentas de prueba eliminadas.

## Pendiente

- Descargar/exportar datos antes de borrar (GDPR).
- Confirmación adicional con contraseña para cuentas de Apple/Google.
- Borrado de avatares cuando exista bucket de avatares.
- Registro de auditoría del borrado (sin datos personales).
