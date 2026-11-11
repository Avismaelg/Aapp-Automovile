import { createClient } from 'npm:@supabase/supabase-js@2';

// MAPA-02: búsqueda de lugares con Google Places (New). La clave vive solo en
// los secretos de Supabase (GOOGLE_MAPS_API_KEY), nunca en la app, y cada
// usuario tiene un tope diario para que la cuenta no gaste por sorpresa.
//
// Acciones:
// - autocomplete { q, lat?, lng?, sessionToken, language? } → sugerencias
// - details { placeId, sessionToken } → coordenadas del lugar elegido
// Autocompletar y el detalle final comparten sessionToken: Google los cobra
// como una sola sesión.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Consultas a Google por usuario y día (autocompletar + detalles). Debe ser
// menor que el global: si no, un solo usuario puede dejar sin buscador a todos.
const DAILY_LIMIT = 60;
// Tope de gasto (US$1): consultas al día para toda la app. ~9.000 al mes,
// dentro de lo gratuito de Google; pasado el tope, la app usa el buscador
// gratuito hasta el día siguiente.
const GLOBAL_DAILY_LIMIT = 300;
const BIAS_RADIUS_M = 50_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Suggestion = {
  placePrediction?: {
    placeId?: string;
    distanceMeters?: number;
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
    text?: { text?: string };
    types?: string[];
  };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Falta la sesión de Caravana.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY')?.trim();
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'Supabase no está configurado en la función.' }, 500);
  if (!googleKey) return json({ error: 'not_configured' }, 503);

  let body: {
    action?: string;
    q?: string;
    lat?: number;
    lng?: number;
    sessionToken?: string;
    placeId?: string;
    language?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo de petición inválido.' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sesión inválida.' }, 401);

  // B5: validar antes de gastar cupo. Una acción inválida o una búsqueda vacía
  // no debe consumir una consulta de Google ni la cuota del usuario.
  const action = body.action;
  const language = body.language === 'en' ? 'en' : 'es';
  const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 64) : undefined;

  let autocompleteQuery = '';
  let nearbyTypes: string[] = [];
  let placeId = '';
  if (action === 'autocomplete') {
    autocompleteQuery = (body.q ?? '').trim().slice(0, 120);
    if (autocompleteQuery.length < 2) return json({ places: [] });
  } else if (action === 'nearby') {
    nearbyTypes = Array.isArray((body as { types?: unknown }).types)
      ? ((body as { types: unknown[] }).types.filter((type) => typeof type === 'string' && /^[a-z_]{3,40}$/.test(type)) as string[]).slice(0, 5)
      : [];
    if (nearbyTypes.length === 0 || !Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      return json({ error: 'Búsqueda inválida.' }, 400);
    }
  } else if (action === 'details') {
    placeId = (body.placeId ?? '').trim();
    if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return json({ error: 'Lugar inválido.' }, 400);
  } else {
    return json({ error: 'Acción inválida.' }, 400);
  }

  const { data: allowed, error: limitError } = await supabase.rpc('bump_place_search', {
    p_limit: DAILY_LIMIT,
    p_global_limit: GLOBAL_DAILY_LIMIT,
  });
  if (limitError) return json({ error: 'No pudimos comprobar tu cupo de búsquedas.' }, 500);
  if (allowed === false) return json({ error: 'daily_limit' }, 429);

  if (action === 'autocomplete') {
    const q = autocompleteQuery;
    const hasOrigin = Number.isFinite(body.lat) && Number.isFinite(body.lng);
    const payload: Record<string, unknown> = {
      input: q,
      includedRegionCodes: ['do'],
      languageCode: language,
      regionCode: 'do',
      sessionToken,
    };
    if (hasOrigin) {
      const center = { latitude: body.lat, longitude: body.lng };
      payload.locationBias = { circle: { center, radius: BIAS_RADIUS_M } };
      payload.origin = center;
    }
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleKey },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { suggestions?: Suggestion[]; error?: { message?: string } };
    if (!response.ok) return json({ error: data.error?.message ?? 'google_error' }, 502);
    const places = (data.suggestions ?? []).flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;
      if (!prediction?.placeId) return [];
      return [
        {
          placeId: prediction.placeId,
          name: prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? '',
          detail: prediction.structuredFormat?.secondaryText?.text ?? '',
          distanceM: prediction.distanceMeters ?? null,
          types: prediction.types ?? [],
        },
      ];
    });
    return json({ places });
  }

  // Paradas por tipo cerca de ti (gasolinera, comida, farmacia…), por distancia.
  if (action === 'nearby') {
    const types = nearbyTypes;
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googleKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.formattedAddress',
      },
      body: JSON.stringify({
        includedTypes: types,
        maxResultCount: 15,
        rankPreference: 'DISTANCE',
        languageCode: language,
        regionCode: 'do',
        locationRestriction: {
          circle: { center: { latitude: body.lat, longitude: body.lng }, radius: 15_000 },
        },
      }),
    });
    const data = (await response.json()) as {
      places?: {
        id?: string;
        displayName?: { text?: string };
        location?: { latitude?: number; longitude?: number };
        formattedAddress?: string;
      }[];
      error?: { message?: string };
    };
    if (!response.ok) return json({ error: data.error?.message ?? 'google_error' }, 502);
    return json({
      places: (data.places ?? []).flatMap((place) =>
        place.id && place.location?.latitude != null && place.location?.longitude != null
          ? [
              {
                placeId: place.id,
                name: place.displayName?.text ?? '',
                detail: place.formattedAddress ?? '',
                latitude: place.location.latitude,
                longitude: place.location.longitude,
              },
            ]
          : [],
      ),
    });
  }

  if (action === 'details') {
    const params = new URLSearchParams({ languageCode: language });
    if (sessionToken) params.set('sessionToken', sessionToken);
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?${params}`, {
      headers: {
        'X-Goog-Api-Key': googleKey,
        // Solo campos «Essentials»: el detalle más barato.
        'X-Goog-FieldMask': 'id,location,formattedAddress',
      },
    });
    const data = (await response.json()) as {
      location?: { latitude?: number; longitude?: number };
      formattedAddress?: string;
      error?: { message?: string };
    };
    if (!response.ok || data.location?.latitude == null || data.location?.longitude == null) {
      return json({ error: data.error?.message ?? 'google_error' }, 502);
    }
    return json({
      latitude: data.location.latitude,
      longitude: data.location.longitude,
      address: data.formattedAddress ?? '',
    });
  }

  return json({ error: 'Acción inválida.' }, 400);
});
