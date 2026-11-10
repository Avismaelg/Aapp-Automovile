import { getLanguage } from '@/src/i18n';

// MAPA-02: Google Places a través de la Edge Function «places» (la clave no
// está en la app). Si la función no está desplegada, no tiene clave o se pasó
// el tope del día, se deja de usar un rato y la búsqueda sigue con Photon.

export type GooglePlace = {
  placeId: string;
  name: string;
  detail: string;
  distanceM: number | null;
  types: string[];
};

type LatLng = { latitude: number; longitude: number };

// Tras un fallo de configuración no se vuelve a probar en este tiempo.
const PAUSE_MS = 10 * 60_000;
let pausedUntil = 0;

// Autocompletar y el detalle final del lugar elegido van con el mismo
// identificador de sesión: Google los cobra como una sola búsqueda.
let session: string | null = null;

function newSessionToken() {
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${random()}${random()}-${random()}-4${random().slice(1)}-${random()}-${random()}${random()}${random()}`;
}

function sessionToken() {
  session ??= newSessionToken();
  return session;
}

export function isGooglePlacesPaused(now = Date.now()) {
  return now < pausedUntil;
}

// Errores con los que no tiene sentido reintentar enseguida.
export function shouldPauseGoogle(status: number | undefined, message: string) {
  return status === 404 || status === 503 || status === 429 || /not_configured|daily_limit/.test(message);
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  // Import diferido: la lógica de búsqueda se puede probar sin el cliente.
  const { supabase } = await import('@/src/lib/supabase');
  if (!supabase) throw new Error('supabase_not_configured');
  const { data, error } = await supabase.functions.invoke('places', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = error.message;
    try {
      const payload = context ? ((await context.clone().json()) as { error?: string }) : null;
      if (payload?.error) message = payload.error;
    } catch {
      // Sin cuerpo JSON: vale el mensaje original.
    }
    if (shouldPauseGoogle(context?.status, message)) pausedUntil = Date.now() + PAUSE_MS;
    throw new Error(message);
  }
  return data as T;
}

export async function googleAutocomplete(query: string, near: LatLng | null): Promise<GooglePlace[]> {
  if (isGooglePlacesPaused()) throw new Error('google_paused');
  const { places } = await invoke<{ places?: GooglePlace[] }>({
    action: 'autocomplete',
    q: query,
    lat: near?.latitude,
    lng: near?.longitude,
    sessionToken: sessionToken(),
    language: getLanguage(),
  });
  return places ?? [];
}

// Coordenadas del lugar elegido (cierra la sesión de búsqueda).
export async function googlePlaceLocation(placeId: string): Promise<LatLng & { address: string }> {
  const token = sessionToken();
  session = null;
  return invoke({ action: 'details', placeId, sessionToken: token, language: getLanguage() });
}

export type GoogleNearbyPlace = {
  placeId: string;
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
};

// Paradas por tipo cerca de ti, de la más cercana a la más lejana.
export async function googleNearby(types: string[], near: LatLng): Promise<GoogleNearbyPlace[]> {
  if (isGooglePlacesPaused()) throw new Error('google_paused');
  const { places } = await invoke<{ places?: GoogleNearbyPlace[] }>({
    action: 'nearby',
    types,
    lat: near.latitude,
    lng: near.longitude,
    language: getLanguage(),
  });
  return places ?? [];
}
