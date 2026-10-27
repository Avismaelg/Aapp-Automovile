import { useQuery } from '@tanstack/react-query';

import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import type { Trip } from '@/src/store/trips';
import { useAuth } from '@/src/store/auth';

export type HighwaySegment = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  speedLimitKmh: number;
  polyline: [number, number][];
};

export type SpeedRecord = {
  id: string;
  segmentId: string;
  userId: string;
  userName: string;
  vehicleName: string | null;
  maxSpeedKmh: number;
  recordedAt: string;
};

const CORRIDOR_METERS = 160;
const MIN_RECORD_KMH = 60;

// Copia local de los tramos para poder mostrar la lista sin conexión.
export const DEFAULT_HIGHWAY_SEGMENTS: HighwaySegment[] = [
  {
    id: 'las-americas',
    slug: 'las-americas',
    name: 'Autopista de las Américas',
    city: 'Santo Domingo',
    speedLimitKmh: 80,
    polyline: [
      [18.478, -69.925],
      [18.472, -69.9],
      [18.466, -69.875],
      [18.462, -69.85],
    ],
  },
  {
    id: 'duarte',
    slug: 'duarte',
    name: 'Autopista Duarte',
    city: 'Santo Domingo',
    speedLimitKmh: 100,
    polyline: [
      [18.5, -69.97],
      [18.52, -70.05],
      [18.545, -70.15],
    ],
  },
  {
    id: 'del-coral',
    slug: 'del-coral',
    name: 'Autopista del Coral',
    city: 'La Romana',
    speedLimitKmh: 110,
    polyline: [
      [18.56, -68.9],
      [18.52, -68.82],
      [18.48, -68.74],
    ],
  },
  {
    id: '30-de-mayo',
    slug: '30-de-mayo',
    name: 'Autopista 30 de Mayo',
    city: 'Santo Domingo',
    speedLimitKmh: 80,
    polyline: [
      [18.44, -69.96],
      [18.445, -69.93],
      [18.452, -69.9],
    ],
  },
];

type SegmentRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  speed_limit_kmh: number;
  polyline: [number, number][];
};

function mapSegment(row: SegmentRow): HighwaySegment {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city,
    speedLimitKmh: row.speed_limit_kmh,
    polyline: Array.isArray(row.polyline) ? row.polyline : [],
  };
}

export function useHighwaySegments() {
  const query = useQuery({
    queryKey: ['highway-segments'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<HighwaySegment[]> => {
      if (!isSupabaseConfigured || !supabase) return DEFAULT_HIGHWAY_SEGMENTS;
      const { data, error } = await supabase
        .from('highway_segments')
        .select('id, slug, name, city, speed_limit_kmh, polyline')
        .order('name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as SegmentRow[]).map(mapSegment);
    },
  });

  return {
    segments: query.data ?? DEFAULT_HIGHWAY_SEGMENTS,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useSpeedRecords() {
  const account = useAuth((state) => state.account);
  const demo = account?.mode === 'demo' || !isSupabaseConfigured || !supabase;

  const query = useQuery({
    queryKey: ['speed-records'],
    enabled: !demo,
    queryFn: async (): Promise<SpeedRecord[]> => {
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('speed_records')
        .select('id, segment_id, user_id, user_name, vehicle_name, max_speed_kmh, recorded_at')
        .order('max_speed_kmh', { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return ((data ?? []) as {
        id: string;
        segment_id: string;
        user_id: string;
        user_name: string;
        vehicle_name: string | null;
        max_speed_kmh: number | string;
        recorded_at: string;
      }[]).map((row) => ({
        id: row.id,
        segmentId: row.segment_id,
        userId: row.user_id,
        userName: row.user_name,
        vehicleName: row.vehicle_name,
        maxSpeedKmh: Number(row.max_speed_kmh),
        recordedAt: row.recorded_at,
      }));
    },
  });

  return {
    records: demo ? [] : query.data ?? [],
    isLoading: demo ? false : query.isLoading,
    isDemo: demo,
    refetch: query.refetch,
  };
}

function pointToPolylineMeters(
  point: { latitude: number; longitude: number },
  polyline: [number, number][],
) {
  if (polyline.length < 2) return Infinity;
  const latRad = (point.latitude * Math.PI) / 180;
  let best = Infinity;
  for (let index = 1; index < polyline.length; index += 1) {
    const [aLat, aLng] = polyline[index - 1];
    const [bLat, bLng] = polyline[index];
    const ax = (aLng - point.longitude) * 111320 * Math.cos(latRad);
    const ay = (aLat - point.latitude) * 111320;
    const bx = (bLng - point.longitude) * 111320 * Math.cos(latRad);
    const by = (bLat - point.latitude) * 111320;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t = length2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2)) : 0;
    const px = ax + dx * t;
    const py = ay + dy * t;
    best = Math.min(best, Math.hypot(px, py));
  }
  return best;
}

// Velocidad máxima del viaje dentro del corredor del tramo.
export function maxSpeedNearSegment(trip: Trip, polyline: [number, number][]): number | null {
  let best: number | null = null;
  for (const point of trip.points) {
    if (point.speedKmh == null || point.speedKmh < MIN_RECORD_KMH) continue;
    if (pointToPolylineMeters(point, polyline) > CORRIDOR_METERS) continue;
    best = best == null ? point.speedKmh : Math.max(best, point.speedKmh);
  }
  return best;
}

// Envía los récords del viaje a Supabase. Devuelve true si ya no queda nada
// pendiente (incluye viajes sin tramos o en modo demo).
export async function submitTripSpeedRecords(
  trip: Trip,
  vehicleName?: string,
): Promise<boolean> {
  const account = useAuth.getState().account;
  if (!account || account.mode === 'demo' || !supabase) return true;

  const { data, error } = await supabase
    .from('highway_segments')
    .select('id, polyline');
  if (error || !data) return false;

  const rows = [];
  for (const segment of data as { id: string; polyline: [number, number][] }[]) {
    const maxSpeed = maxSpeedNearSegment(trip, segment.polyline ?? []);
    if (maxSpeed == null) continue;
    rows.push({
      segment_id: segment.id,
      user_id: account.id,
      user_name: account.displayName,
      vehicle_name: vehicleName ?? null,
      max_speed_kmh: Math.round(maxSpeed * 10) / 10,
      distance_m: Math.round(trip.distanceM),
      recorded_at: new Date(trip.endedAt ?? Date.now()).toISOString(),
    });
  }

  if (rows.length === 0) return true;
  const { error: insertError } = await supabase.from('speed_records').insert(rows);
  return !insertError;
}
