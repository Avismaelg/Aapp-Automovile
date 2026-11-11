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

// Compara el secreto en tiempo constante: los dos se reducen a SHA-256 (32
// bytes siempre) y se comparan byte a byte sin salir antes, así el tiempo de
// respuesta no revela cuántos caracteres acertó quien prueba.
async function validSecret(expected: string | undefined, received: string | null): Promise<boolean> {
  if (!expected || received == null) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [expected, received].map(async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))),
  );
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!(await validSecret(Deno.env.get('PUSH_WEBHOOK_SECRET'), request.headers.get('x-push-secret')))) {
    return json({ error: 'forbidden' }, 403);
  }

  // Mismos nombres alternativos que livekit-token («URL», «API KEY», «API SECRET»).
  // Si en el valor se pegó la línea entera («LIVEKIT_URL=wss://…»), se quita
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
  const url = secret('LIVEKIT_URL', 'url', 'URL')?.replace(/[./\s]+$/, '');
  const key = secret('LIVEKIT_API_KEY', 'Apikey', 'API KEY');
  const apiSecret = secret('LIVEKIT_API_SECRET', 'secret', 'API SECRET');
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
