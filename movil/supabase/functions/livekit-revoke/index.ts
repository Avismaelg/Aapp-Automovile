import { RoomServiceClient } from 'npm:livekit-server-sdk@2';

// P1-3 (docs/AUDITORIA-PRODUCCION.md): quien sale del convoy o es expulsado
// sale también de la sala de voz al momento, sin esperar a que caduque su
// token. La llama el trigger party_members_voice_revoke (pg_net) con el
// secreto compartido de los avisos; nunca la app.
//
// Body: { party_id, user_id }

const CHANNELS = ['convoy', 'route', 'chat'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || request.headers.get('x-push-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const url = Deno.env.get('LIVEKIT_URL')?.trim().replace(/[./\s]+$/, '');
  const key = Deno.env.get('LIVEKIT_API_KEY')?.trim();
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')?.trim();
  if (!url || !key || !apiSecret) return json({ error: 'not_configured' }, 503);

  let body: { party_id?: string; user_id?: string; voice_room?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!body.user_id || !uuid.test(body.user_id) || !body.voice_room || !/^[a-z0-9_]{1,80}$/i.test(body.voice_room)) {
    return json({ error: 'bad_request' }, 400);
  }

  const rooms = new RoomServiceClient(url.replace(/^wss?:/, 'https:'), key, apiSecret);
  let removed = 0;
  await Promise.all(
    CHANNELS.map(async (slug) => {
      try {
        await rooms.removeParticipant(`${body.voice_room}_${slug}`, body.user_id as string);
        removed += 1;
      } catch {
        // No estaba en ese canal (o la sala ya no existe): nada que hacer.
      }
    }),
  );
  return json({ removed });
});
