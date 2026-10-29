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

  // Borrar primero los archivos; las filas se eliminan por cascada.
  const { data: posts } = await admin
    .from('posts')
    .select('id')
    .eq('user_id', user.id);

  for (const post of posts ?? []) {
    const postId = post.id as string;
    const { data: files } = await admin.storage.from('posts').list(postId);
    if (files && files.length > 0) {
      await admin.storage
        .from('posts')
        .remove(files.map((file) => `${postId}/${file.name}`));
    }
  }

  // Fotos de vehículos y avatar: buckets públicos organizados por usuario.
  for (const bucket of ['vehicles', 'avatars']) {
    const paths = await listFilesDeep(admin.storage, bucket, user.id);
    if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return json(
      { error: 'No pudimos eliminar la cuenta. Inténtalo de nuevo.' },
      500,
    );
  }

  return json({ ok: true });
});
