import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedChannels = new Set(['convoy', 'route', 'chat']);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  // Los secretos se pegan a mano en el panel: se quitan espacios y el punto o
  // la barra final («wss://…livekit.cloud.» no conecta).
  // También se aceptan los nombres cortos («URL», «API KEY», «API SECRET»):
  // así se guardaron en el panel la primera vez. Si se pega la dirección
  // https:// en vez de wss://, se convierte.
  // Y si en el valor se pegó la línea entera («LIVEKIT_URL=wss://…»), se quita
  // el «NOMBRE=» del principio y las comillas.
  const secret = (...names: string[]) => {
    for (const name of names) {
      const value = Deno.env.get(name)
        ?.trim()
        .replace(/^LIVEKIT_[A-Z_]+\s*=\s*/, '')
        .replace(/^["']|["']$/g, '')
        .trim();
      if (value) return value;
    }
    return undefined;
  };
  // Orden: el nombre oficial y, si no existe, los que hay guardados en el panel
  // («url», «Apikey», «secret»).
  const livekitUrl = secret('LIVEKIT_URL', 'url', 'URL')?.replace(/[./\s]+$/, '').replace(/^http/i, 'ws');
  const livekitApiKey = secret('LIVEKIT_API_KEY', 'Apikey', 'API KEY');
  const livekitApiSecret = secret('LIVEKIT_API_SECRET', 'secret', 'API SECRET');

  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'Supabase no está configurado en la función.' }, 500);
  }
  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return json(
      {
        error:
          'LiveKit no está configurado. Añade LIVEKIT_URL, LIVEKIT_API_KEY y LIVEKIT_API_SECRET a los secretos de Supabase.',
      },
      503,
    );
  }

  let body: { partyId?: string; channelSlug?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo de petición inválido.' }, 400);
  }

  const partyId = body.partyId;
  const channelSlug = body.channelSlug;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!partyId || !uuid.test(partyId) || !channelSlug || !allowedChannels.has(channelSlug)) {
    return json({ error: 'Party o canal inválido.' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return json({ error: 'Sesión inválida.' }, 401);
  }

  const { data: party, error: partyError } = await supabase
    .from('parties')
    .select('id, voice_room, status, name')
    .eq('id', partyId)
    .in('status', ['scheduled', 'live'])
    // P1-7: un convoy caducado (24 h) no da voz.
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (partyError || !party) {
    return json({ error: 'Party no encontrada o inactiva.' }, 404);
  }

  const { data: membership, error: membershipError } = await supabase
    .from('party_members')
    .select('party_id')
    .eq('party_id', partyId)
    .eq('user_id', user.id)
    .is('left_at', null)
    .maybeSingle();

  if (membershipError || !membership) {
    return json({ error: 'No eres miembro de esta party.' }, 403);
  }

  const { data: channel, error: channelError } = await supabase
    .from('party_voice_channels')
    .select('slug, name')
    .eq('party_id', partyId)
    .eq('slug', channelSlug)
    .maybeSingle();

  if (channelError || !channel) {
    return json({ error: 'Canal de voz no encontrado.' }, 404);
  }

  const roomName = `${party.voice_room}_${channelSlug}`;
  // P2-1: el nombre del perfil, nunca parte del correo.
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  const displayName = (profile?.display_name as string | undefined)?.trim() || 'Piloto';

  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: user.id,
    name: displayName,
    // P1-3: corto; al salir del convoy además se echa de la sala
    // (livekit-revoke), así que no hay que esperar a que caduque.
    ttl: '15m',
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return json({
    token: await token.toJwt(),
    url: livekitUrl,
    roomName,
    channelSlug,
    channelName: channel.name,
  });
});
