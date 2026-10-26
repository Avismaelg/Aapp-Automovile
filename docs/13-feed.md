# Feed social, fotos y comentarios

El feed de Caravana permite publicar texto o foto, dar/quitar me gusta y
comentar. Las publicaciones respetan la visibilidad elegida:

- `public`: cualquiera con sesión puede verla.
- `friends`: solo amigos aceptados.
- `private`: solo el autor.

## Flujo

1. Desde Inicio se publica un texto, una foto o ambos, con visibilidad.
2. Si hay foto, la imagen se sube al bucket privado `posts` y se guarda la ruta
   en `post_media`.
3. El feed carga las publicaciones visibles ordenadas por fecha y pide URLs
   firmadas para las imágenes.
4. Like y comentarios actualizan el contador y el detalle del post.
5. El detalle `/post/[id]` muestra la publicación, comentarios y un composer.
6. Cada usuario puede borrar sus propios comentarios; el autor del post también
   puede borrarlos según RLS.
7. Supabase Realtime invalida comentarios y contadores al recibir cambios.

## Datos y RLS

- `posts`: autor, tipo, caption, visibilidad y referencias opcionales a vehículo,
  viaje o party.
- `post_media`: ruta de la imagen y posición dentro del post.
- `likes`: clave primaria `(post_id, user_id)`.
- `comments`: hasta 500 caracteres.
- `comments_select` e `comments_insert` usan `can_view_post`.
- `comments_delete` permite al autor del comentario o al autor del post.
- Bucket privado `posts` (5 MB, JPG/PNG/WebP) con lectura por `can_view_post` y
  subida limitada al autor del post.
- Migraciones: `init_caravana` y `20261026100000_post_media_storage.sql`.

## Cliente

- `src/hooks/useFeed.ts`: feed, post individual, publicar, foto y likes.
- `src/hooks/useComments.ts`: comentarios, Realtime, alta y borrado.
- `src/components/PostCard.tsx`: like, imagen y acceso a comentarios.
- `app/post/[id].tsx`: detalle y composer.
- `app/post/new.tsx`: publicación de texto o foto con `expo-image-picker`.

## Probado

- Cuenta temporal con una publicación pública.
- Apertura del detalle `/post/<id>`.
- Comentario publicado: contador de comentarios subió a 1 y la fila quedó en
  Supabase.
- Borrado del comentario: contador volvió a 0 y la fila desapareció.
- Foto subida desde la galería web a Storage; se creó `post_media`, se generó una
  URL firmada y la imagen apareció en el feed.
- Borrado del objeto de Storage y de la cuenta de prueba.
- Cuenta, post, comentarios y objeto de prueba eliminados.

## Pendiente

- Vídeo y varias imágenes por post.
- Guardados, respuestas anidadas y menciones.
- Moderación, reportes y edición de comentarios.
- Paginación del feed y de comentarios para volúmenes grandes.
