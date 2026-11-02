import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type StorageClient = ReturnType<typeof createClient>['storage'];

// Rutas de todos los archivos bajo una carpeta, incluidas subcarpetas
// (las fotos de vehículos viven en {usuario}/{vehículo}/archivo).
async function listFilesDeep(storage: StorageClient, bucket: string, folder: string) {
  const paths: string[] = [];
  const { data } = await storage.from(bucket).list(folder, { limit: 1000 });
  for (const entry of data ?? []) {
    const path = `${folder}/${entry.name}`;
    // Las carpetas no tienen id en la respuesta de list().
    if (entry.id) paths.push(path);
    else paths.push(...(await listFilesDeep(storage, bucket, path)));
  }
  return paths;
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
    return json(
      { error: 'La función no tiene configuradas las claves de Supabase.' },
      500,
    );
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

  // RF-03 / RNF-12: se reúnen primero las rutas de todos sus archivos, se
  // borra el usuario de Auth (las filas caen en cascada) y solo entonces los
  // archivos. Si Auth falla no se ha borrado nada y la cuenta sigue intacta.
  const toRemove: { bucket: string; paths: string[] }[] = [];
  const { data: posts, error: postsError } = await admin
    .from('posts')
    .select('id')
    .eq('user_id', user.id);
  if (postsError) {
    return json({ error: 'No pudimos eliminar la cuenta. Inténtalo de nuevo.' }, 500);
  }
  const postPaths: string[] = [];
  for (const post of posts ?? []) {
    postPaths.push(...(await listFilesDeep(admin.storage, 'posts', post.id as string)));
  }
  toRemove.push({ bucket: 'posts', paths: postPaths });
  // Fotos de vehículos, avatar y recibos: carpetas por usuario.
  for (const bucket of ['vehicles', 'avatars', 'receipts']) {
    toRemove.push({ bucket, paths: await listFilesDeep(admin.storage, bucket, user.id) });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json(
      { error: 'No pudimos eliminar la cuenta. Inténtalo de nuevo.' },
      500,
    );
  }

  // La cuenta ya no existe: los archivos se borran con reintentos, de 1000 en 1000.
  const failed: string[] = [];
  for (const { bucket, paths } of toRemove) {
    for (let index = 0; index < paths.length; index += 1000) {
      const batch = paths.slice(index, index + 1000);
      let ok = false;
      for (let attempt = 0; attempt < 3 && !ok; attempt += 1) {
        const { error } = await admin.storage.from(bucket).remove(batch);
        ok = !error;
      }
      if (!ok) failed.push(`${bucket}: ${batch.length}`);
    }
  }
  if (failed.length > 0) console.error('Archivos sin borrar tras eliminar la cuenta', user.id, failed);

  return json({ ok: true });
});
