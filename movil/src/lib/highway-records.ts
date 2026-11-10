import { useQuery } from '@tanstack/react-query';

import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { t } from '@/src/i18n';

export type HighwaySegment = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  speedLimitKmh: number;
  polyline: [number, number][];
};


// Copia local de los tramos para poder mostrar la lista sin conexión.
export const DEFAULT_HIGHWAY_SEGMENTS: HighwaySegment[] = [
  {
    id: 'las-americas',
    slug: 'las-americas',
    name: t('Autopista de las Américas'),
    city: t('Santo Domingo'),
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
    name: t('Autopista Duarte'),
    city: t('Santo Domingo'),
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
    name: t('Autopista del Coral'),
    city: t('La Romana'),
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
    name: t('Autopista 30 de Mayo'),
    city: t('Santo Domingo'),
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

export { segmentStats, type SegmentStats } from '@/src/lib/segment-stats';
