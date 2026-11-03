import { createClient } from 'npm:@supabase/supabase-js@2';

import { streetFromInstruction } from './street.ts';

// MAPA-12: rutas con el tráfico de Google (Routes API, el mismo tráfico que
// alimenta Google Maps y Waze). La clave vive solo en los secretos de
// Supabase (GOOGLE_MAPS_API_KEY). Devuelve las rutas en el formato de OSRM
// (pasos con maniobra y calle), el mismo que ya entiende la app.
//
// Body: { origin: {lat,lng}, destination: {lat,lng}, stops?: [{lat,lng}], language? }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Tope de gasto: dentro de lo gratuito de Google (ver migración route_quota).
const USER_DAILY_LIMIT = 60;
const GLOBAL_DAILY_LIMIT = 150;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type LatLng = { lat: number; lng: number };

function validPoint(point: unknown): point is LatLng {
  const p = point as LatLng;
  return (
    Boolean(p) &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

// Polilínea codificada de Google → [[lng, lat], ...] (como GeoJSON).
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;
}

// Maniobra de Google → tipo y sentido de OSRM.
function maneuver(name: string | undefined): { type: string; modifier?: string } {
  switch (name) {
    case 'TURN_LEFT':
      return { type: 'turn', modifier: 'left' };
    case 'TURN_RIGHT':
      return { type: 'turn', modifier: 'right' };
    case 'TURN_SLIGHT_LEFT':
      return { type: 'turn', modifier: 'slight left' };
    case 'TURN_SLIGHT_RIGHT':
      return { type: 'turn', modifier: 'slight right' };
    case 'TURN_SHARP_LEFT':
      return { type: 'turn', modifier: 'sharp left' };
    case 'TURN_SHARP_RIGHT':
      return { type: 'turn', modifier: 'sharp right' };
    case 'UTURN_LEFT':
    case 'UTURN_RIGHT':
      return { type: 'turn', modifier: 'uturn' };
    case 'RAMP_LEFT':
      return { type: 'on ramp', modifier: 'left' };
    case 'RAMP_RIGHT':
      return { type: 'on ramp', modifier: 'right' };
    case 'FORK_LEFT':
      return { type: 'fork', modifier: 'left' };
    case 'FORK_RIGHT':
      return { type: 'fork', modifier: 'right' };
    case 'MERGE':
      return { type: 'merge', modifier: 'straight' };
    case 'ROUNDABOUT_LEFT':
    case 'ROUNDABOUT_RIGHT':
      return { type: 'roundabout', modifier: 'straight' };
    case 'DEPART':
      return { type: 'depart' };
    case 'STRAIGHT':
    case 'NAME_CHANGE':
      return { type: 'continue', modifier: 'straight' };
    default:
      return { type: 'continue', modifier: 'straight' };
  }
}

type GoogleStep = {
  distanceMeters?: number;
  navigationInstruction?: { maneuver?: string; instructions?: string };
};

type GoogleRoute = {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  legs?: { steps?: GoogleStep[] }[];
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

  let body: { origin?: LatLng; destination?: LatLng; stops?: LatLng[]; language?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Cuerpo de petición inválido.' }, 400);
  }
  const stops = (body.stops ?? []).slice(0, 10);
  if (!validPoint(body.origin) || !validPoint(body.destination) || !stops.every(validPoint)) {
    return json({ error: 'Puntos inválidos.' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Sesión inválida.' }, 401);

  const { data: allowed, error: quotaError } = await supabase.rpc('bump_route_quota', {
    p_limit: USER_DAILY_LIMIT,
    p_global_limit: GLOBAL_DAILY_LIMIT,
  });
  if (quotaError) return json({ error: 'No pudimos comprobar el cupo de rutas.' }, 500);
  if (allowed === false) return json({ error: 'daily_limit' }, 429);

  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const payload = {
    origin: point(body.origin),
    destination: point(body.destination),
    intermediates: stops.map(point),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    computeAlternativeRoutes: stops.length === 0,
    languageCode: body.language === 'en' ? 'en' : 'es',
    regionCode: 'DO',
    units: 'METRIC',
  };
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': googleKey,
      'X-Goog-FieldMask':
        'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,' +
        'routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction',
    },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as { routes?: GoogleRoute[]; error?: { message?: string } };
  if (!response.ok) return json({ error: data.error?.message ?? 'google_error' }, 502);

  const routes = (data.routes ?? []).flatMap((route) => {
    const encoded = route.polyline?.encodedPolyline;
    if (!encoded) return [];
    const seconds = Number((route.duration ?? '0s').replace('s', ''));
    return [
      {
        distance: route.distanceMeters ?? 0,
        duration: Number.isFinite(seconds) ? seconds : 0,
        geometry: { coordinates: decodePolyline(encoded) },
        legs: (route.legs ?? []).map((leg) => ({
          steps: [
            ...(leg.steps ?? []).map((step) => ({
              distance: step.distanceMeters ?? 0,
              name: streetFromInstruction(step.navigationInstruction?.instructions),
              maneuver: maneuver(step.navigationInstruction?.maneuver),
            })),
            // Fin de cada tramo: parada intermedia o llegada.
            { distance: 0, maneuver: { type: 'arrive' } },
          ],
        })),
      },
    ];
  });
  if (routes.length === 0) return json({ code: 'NoRoute', routes: [] }, 404);
  return json({ code: 'Ok', routes });
});
