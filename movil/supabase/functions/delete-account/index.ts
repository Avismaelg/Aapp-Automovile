import { createClient } from 'npm:@supabase/supabase-js@2';

// Borra la cuenta del usuario que llama (su JWT) y sus archivos. Los datos de
// la base de datos se van en cascada al borrar el usuario de Auth.
//
// Fase 7 del prompt de producción (P1-4, P2-2):
// - Nunca responde «todo borrado» si quedan archivos: { ok: true,
//   storage: 'partial', pending } y los apunta en private.storage_cleanup.
// - Cada llamada reintenta además lo pendiente de borrados anteriores.
// - Lista las carpetas paginando (antes, solo los 1.000 primeros archivos).
// - Los errores internos van al registro de la función, no al cliente.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAGE = 1000;
const RETRIES = 3;
// Pendientes de otros borrados que se reintentan en cada llamada.
const QUEUE_BATCH = 200;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type StorageClient = ReturnType<typeof createClient>['storage'];

async function listFilesDeep(storage: StorageClient, bucket: string, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.from(bucket).list(folder, { limit: PAGE, offset });
    if (error) throw new Error(`list ${bucket}`);
    for (const entry of data ?? []) {
      const path = `${folder}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...(await listFilesDeep(storage, bucket, path)));
    }
    if (!data || data.length < PAGE) break;
  }
  return paths;
}

// Borra por lotes con reintentos; devuelve lo que no se pudo borrar.
async function removeAll(storage: StorageClient, bucket: string, paths: string[]) {
  const failed: string[] = [];
  for (let index = 0; index < paths.length; index += PAGE) {
    const batch = paths.slice(index, index + PAGE);
    let ok = false;
    for (let attempt = 0; attempt < RETRIES && !ok; attempt += 1) {
      const { error } = await storage.from(bucket).remove(batch);
      ok = !error;
    }
    if (!ok) failed.push(...batch);
  }
  return failed;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return json({ error: 'Método no permitido.' }, 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return json({ error: 'Falta la sesión de Caravana.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'La función no tiene configuradas las claves de Supabase.' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return json({ error: 'Sesión inválida.' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Qué archivos tiene (antes de borrar las filas que los apuntan).
  const toRemove: { bucket: string; paths: string[] }[] = [];
  try {
    const { data: posts, error: postsError } = await admin.from('posts').select('id').eq('user_id', user.id);
    if (postsError) throw new Error('posts');
    const postPaths: string[] = [];
    for (const post of posts ?? []) {
      postPaths.push(...(await listFilesDeep(admin.storage, 'posts', post.id as string)));
    }
    toRemove.push({ bucket: 'posts', paths: postPaths });
    for (const bucket of ['vehicles', 'avatars', 'receipts']) {
      toRemove.push({ bucket, paths: await listFilesDeep(admin.storage, bucket, user.id) });
    }
  } catch (listError) {
    // Sin la lista no se borra nada: la cuenta sigue intacta y se puede reintentar.
    console.error('delete-account: no se pudieron listar los archivos', user.id, String(listError));
    return json({ error: 'No pudimos eliminar la cuenta. Inténtalo de nuevo.' }, 500);
  }

  // 2. La cuenta (y en cascada sus datos).
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account: deleteUser falló', user.id, deleteError.message);
    return json({ error: 'No pudimos eliminar la cuenta. Inténtalo de nuevo.' }, 500);
  }

  // 3. Los archivos. Lo que falle queda en la cola (solo bucket y ruta).
  const pending: { bucket: string; path: string }[] = [];
  for (const { bucket, paths } of toRemove) {
    for (const path of await removeAll(admin.storage, bucket, paths)) pending.push({ bucket, path });
  }
  if (pending.length > 0) {
    const { error: queueError } = await admin.rpc('queue_storage_cleanup', { p_items: pending });
    if (queueError) console.error('delete-account: no se pudo encolar', user.id, pending.length, queueError.message);
  }

  // 4. Reintenta lo pendiente de borrados anteriores.
  try {
    const { data: queued } = await admin.rpc('next_storage_cleanup', { p_limit: QUEUE_BATCH });
    const byBucket = new Map<string, string[]>();
    for (const item of (queued ?? []) as { bucket: string; path: string }[]) {
      byBucket.set(item.bucket, [...(byBucket.get(item.bucket) ?? []), item.path]);
    }
    for (const [bucket, paths] of byBucket) {
      const failed = new Set(await removeAll(admin.storage, bucket, paths));
      const done = paths.filter((path) => !failed.has(path)).map((path) => ({ bucket, path }));
      if (done.length) await admin.rpc('finish_storage_cleanup', { p_items: done });
    }
  } catch (retryError) {
    console.error('delete-account: reintento de la cola', String(retryError));
  }

  return json(
    pending.length === 0 ? { ok: true, storage: 'complete' } : { ok: true, storage: 'partial', pending: pending.length },
  );
});
