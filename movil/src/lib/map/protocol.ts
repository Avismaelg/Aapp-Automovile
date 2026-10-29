// Tipos y mensajes que intercambian la app y el mapa dentro del WebView.

export type WorldMapMember = {
  id: string;
  name: string;
  color: string;
  latitude: number;
  longitude: number;
  isTalking?: boolean;
  battery?: number;
};

export type WorldMapDestination = {
  latitude: number;
  longitude: number;
  label: string;
};

export type WorldMapLocation = {
  latitude: number;
  longitude: number;
  heading?: number | null;
  accuracy?: number | null;
  speedKmh?: number | null;
};

// Coordenadas en formato [latitud, longitud], igual que GraphHopper.
export type RouteInstructionIcon =
  | 'straight'
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'uturn'
  | 'roundabout'
  | 'merge'
  | 'arrive'
  | 'depart';

export type RouteInstruction = {
  icon: RouteInstructionIcon;
  text: string;
  road?: string;
  atDistanceM: number;
};

export type WorldMapRoute = {
  coordinates: [number, number][];
  distanceM: number;
  timeMs: number;
  source: 'graphhopper' | 'osrm' | 'fallback';
  instructions?: RouteInstruction[];
};

// Ruta alternativa que se pinta en gris; index es su posición en la lista.
export type WorldMapAlternative = {
  index: number;
  coordinates: [number, number][];
};

export type WorldMapVehicleKind = 'car' | 'motorcycle' | 'ev' | 'truck';

export type WorldMapTravelMode = 'car' | 'walking';

export type WorldMapParking = {
  latitude: number;
  longitude: number;
};

export type WorldMapCommand =
  | { type: 'location'; payload: WorldMapLocation }
  | { type: 'members'; payload: WorldMapMember[] }
  | { type: 'destination'; payload: WorldMapDestination | null }
  | { type: 'route'; payload: WorldMapRoute | null }
  | { type: 'alternatives'; payload: WorldMapAlternative[] }
  | { type: 'vehicle'; payload: { color: string; kind?: WorldMapVehicleKind } }
  | { type: 'parking'; payload: WorldMapParking | null }
  | { type: 'travel'; payload: WorldMapTravelMode }
  | { type: 'north'; payload: boolean }
  | { type: 'fit'; payload: { coordinates: [number, number][] } }
  | { type: 'autofollow'; payload: boolean }
  | { type: 'recenter' };

export type WorldMapEvent =
  | { type: 'ready' }
  | { type: 'follow'; value: boolean }
  | { type: 'memberTap'; id: string }
  | { type: 'alternativeTap'; index: number }
  | { type: 'error'; message: string };

export function encodeWorldMapCommand(seq: number, command: WorldMapCommand) {
  return JSON.stringify({ ...command, seq });
}

export function parseWorldMapEvent(raw: unknown): WorldMapEvent | null {
  if (typeof raw !== 'string') return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const event = data as {
    type?: unknown;
    value?: unknown;
    id?: unknown;
    index?: unknown;
    message?: unknown;
  };
  if (event.type === 'ready') return { type: 'ready' };
  if (event.type === 'follow' && typeof event.value === 'boolean') {
    return { type: 'follow', value: event.value };
  }
  if (event.type === 'memberTap' && typeof event.id === 'string') {
    return { type: 'memberTap', id: event.id };
  }
  if (event.type === 'alternativeTap' && typeof event.index === 'number') {
    return { type: 'alternativeTap', index: event.index };
  }
  if (event.type === 'error' && typeof event.message === 'string') {
    return { type: 'error', message: event.message };
  }
  return null;
}
