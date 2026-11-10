import { createClient } from 'npm:@supabase/supabase-js@2';

// MAPA-24: avisos con la app cerrada por Firebase Cloud Messaging (HTTP v1).
// La llaman los triggers de la base de datos (migración push_notifications)
// con un secreto compartido; nunca la app. La cuenta de servicio de Firebase
// vive solo en los secretos de Supabase (FIREBASE_SERVICE_ACCOUNT).
//
// Body: { kind: 'party_invite' | 'challenge_invite' | 'friend_request', record: {...} }

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
type Message = { userId: string; title: string; body: string; url: string; tag: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function base64url(input: ArrayBuffer | string) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Token de acceso de Google para FCM (JWT firmado con la clave de la cuenta
// de servicio). Se reutiliza mientras no caduque.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(account: ServiceAccount) {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${base64url(signature)}`,
    }),
  });
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) throw new Error('google_auth_failed');
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

// iPhone: directo a APNs con la clave .p8 de Apple (JWT ES256, válido 1 h;
// Apple pide renovarlo entre 20 y 60 min). Secretos APNS_KEY_ID,
// APNS_TEAM_ID y APNS_PRIVATE_KEY; sin ellos los iPhone no reciben avisos.
let cachedApns: { value: string; expiresAt: number } | null = null;

async function apnsToken(keyId: string, teamId: string, privateKey: string) {
  if (cachedApns && cachedApns.expiresAt > Date.now()) return cachedApns.value;
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const pem = privateKey.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto devuelve la firma ECDSA como r||s, el formato que pide el JWT.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  cachedApns = { value: `${header}.${claims}.${base64url(signature)}`, expiresAt: Date.now() + 40 * 60_000 };
  return cachedApns.value;
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

  const rawAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!rawAccount || !supabaseUrl || !serviceKey) return json({ error: 'not_configured' }, 503);
  const account = JSON.parse(rawAccount) as ServiceAccount;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let payload: { kind?: string; record?: Record<string, unknown> };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const record = payload.record ?? {};

  const profileName = async (id: unknown) => {
    const { data } = await admin.from('profiles').select('display_name, username').eq('id', id).maybeSingle();
    return {
      name: (data?.display_name as string | undefined) || (data?.username as string | undefined) || 'Un amigo',
      username: (data?.username as string | undefined) ?? null,
    };
  };

  let message: Message | null = null;
  if (payload.kind === 'party_invite') {
    const inviter = await profileName(record.inviter_id);
    const destination = record.destination_label ? ` · hacia ${record.destination_label}` : '';
    message = {
      userId: String(record.invitee_id),
      title: `${inviter.name} te invita a su convoy`,
      body: `${record.party_name ?? 'Convoy'}${destination}. Toca para unirte.`,
      url: '/',
      tag: `party-invite-${record.id}`,
    };
  } else if (payload.kind === 'challenge_invite') {
    const { data: challenge } = await admin
      .from('challenges')
      .select('title, host_id, to_label')
      .eq('id', record.challenge_id)
      .maybeSingle();
    if (challenge && challenge.host_id !== record.user_id) {
      const host = await profileName(challenge.host_id);
      message = {
        userId: String(record.user_id),
        title: `${host.name} te reta`,
        body: `${challenge.title}${challenge.to_label ? ` · meta: ${challenge.to_label}` : ''}`,
        url: '/(tabs)/challenges',
        tag: `challenge-${record.challenge_id}`,
      };
    }
  } else if (payload.kind === 'friend_request') {
    const requester = await profileName(record.requester_id);
    message = {
      userId: String(record.addressee_id),
      title: `${requester.name} quiere ser tu amigo`,
      body: 'Acéptalo para veros en el mapa y salir en convoy.',
      url: requester.username ? `/u/${requester.username}` : '/friends',
      tag: `friend-${record.id}`,
    };
  }
  if (!message) return json({ sent: 0 });

  const { data: allTokens } = await admin
    .from('push_tokens')
    .select('token, platform')
    .eq('user_id', message.userId);
  if (!allTokens?.length) return json({ sent: 0 });
  const tokens = allTokens.filter((row) => row.platform === 'android');
  const iosTokens = allTokens.filter((row) => row.platform === 'ios');

  let sent = 0;
  const stale: string[] = [];
  const bearer = tokens.length ? await accessToken(account) : '';
  await Promise.all(
    tokens.map(async ({ token }) => {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: { url: message.url },
            android: {
              priority: 'HIGH',
              notification: { channel_id: 'convoy', tag: message.tag, color: '#FF6A33' },
            },
            apns: { payload: { aps: { sound: 'default', 'thread-id': message.tag } } },
          },
        }),
      });
      if (response.ok) sent += 1;
      // Teléfono sin la app o token caducado: se borra.
      else if (response.status === 404 || response.status === 400) stale.push(token);
    }),
  );

  const apnsKeyId = Deno.env.get('APNS_KEY_ID');
  const apnsTeamId = Deno.env.get('APNS_TEAM_ID');
  const apnsKey = Deno.env.get('APNS_PRIVATE_KEY');
  if (iosTokens.length && apnsKeyId && apnsTeamId && apnsKey) {
    const jwt = await apnsToken(apnsKeyId, apnsTeamId, apnsKey);
    const topic = Deno.env.get('APNS_BUNDLE_ID') ?? 'app.caravana.mobile';
    await Promise.all(
      iosTokens.map(async ({ token }) => {
        const response = await fetch(`https://api.push.apple.com/3/device/${token}`, {
          method: 'POST',
          headers: {
            authorization: `bearer ${jwt}`,
            'apns-topic': topic,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-collapse-id': message.tag.slice(0, 64),
          },
          body: JSON.stringify({
            aps: { alert: { title: message.title, body: message.body }, sound: 'default', 'thread-id': message.tag },
            // expo-notifications lee los datos de «body»; url también suelto.
            body: { url: message.url },
            url: message.url,
          }),
        });
        if (response.ok) sent += 1;
        // 410 = la app ya no está; 400 BadDeviceToken = token no válido.
        else if (response.status === 410 || response.status === 400) stale.push(token);
      }),
    );
  }
  if (stale.length) await admin.from('push_tokens').delete().in('token', stale);
  return json({ sent, removed: stale.length });
});
