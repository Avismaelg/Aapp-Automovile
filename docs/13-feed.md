# Feed social y comentarios

El feed de Caravana permite publicar texto, dar/quitar me gusta y comentar. Las
publicaciones respetan la visibilidad elegida:

- `public`: cualquiera con sesión puede verla.
- `friends`: solo amigos aceptados.
- `private`: solo el autor.

## Flujo

1. Desde Inicio se publica un texto con visibilidad.
2. El feed carga las publicaciones visibles ordenadas por fecha.
3. Like y comentarios actualizan el contador y el detalle del post.
4. El detalle `/post/[id]` muestra la publicación, comentarios y un composer.
5. Cada usuario puede borrar sus propios comentarios; el autor del post también
   puede borrarlos según RLS.
6. Supabase Realtime invalida comentarios y contadores al recibir cambios.

## Datos y RLS

- `posts`: autor, tipo, caption, visibilidad y referencias opcionales a vehículo,
  viaje o party.
- `likes`: clave primaria `(post_id, user_id)`.
- `comments`: hasta 500 caracteres.
- `comments_select` e `comments_insert` usan `can_view_post`.
- `comments_delete` permite al autor del comentario o al autor del post.
- Migración original: `init_caravana`. No se necesitó una migración nueva para
  comentarios.

## Cliente

- `src/hooks/useFeed.ts`: feed, post individual, publicar y likes.
- `src/hooks/useComments.ts`: comentarios, Realtime, alta y borrado.
- `src/components/PostCard.tsx`: like y acceso a comentarios.
- `app/post/[id].tsx`: detalle y composer.
- `app/post/new.tsx`: publicación de texto.

## Probado

- Cuenta temporal con una publicación pública.
- Apertura del detalle `/post/<id>`.
- Comentario publicado: contador de comentarios subió a 1 y la fila quedó en
  Supabase.
- Borrado del comentario: contador volvió a 0 y la fila desapareció.
- Cuenta, post y comentarios de prueba eliminados.

## Pendiente

- Fotos y vídeo con Supabase Storage.
- Guardados, respuestas anidadas y menciones.
- Moderación, reportes y edición de comentarios.
- Paginación del feed y de comentarios para volúmenes grandes.
