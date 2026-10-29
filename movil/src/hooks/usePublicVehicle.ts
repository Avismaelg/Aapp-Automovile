import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { Vehicle } from '@/src/types/models';
import { isDemoMode } from '@/src/lib/demo';
import { mapVehicleRow, type VehicleOwner, type VehicleRow } from '@/src/lib/vehicle-db';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { useDemoGarage } from '@/src/store/demoGarage';

export function usePublicVehicle(slug?: string) {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const demoVehicles = useDemoGarage((state) => state.vehicles);
  const demoHydrated = useDemoGarage((state) => state.hydrated);
  const hydrateDemo = useDemoGarage((state) => state.hydrate);

  useEffect(() => {
    if (demo) void hydrateDemo();
  }, [demo, hydrateDemo]);

  const query = useQuery({
    queryKey: [
      'public-vehicle',
      slug ?? '',
      demo ? 'demo' : 'supabase',
      demo ? `${demoHydrated}:${demoVehicles.length}` : '',
    ],
    enabled: Boolean(slug),
    queryFn: async (): Promise<Vehicle | null> => {
      if (!slug) return null;

      if (demo) {
        return demoVehicles.find((vehicle) => vehicle.qrSlug === slug) ?? null;
      }

      if (!supabase) return null;

      const { data: row, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('qr_slug', slug)
        .maybeSingle<VehicleRow>();

      if (error) throw new Error(error.message);
      if (!row) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', row.owner_id)
        .maybeSingle<{ username: string; display_name: string }>();

      const owner: VehicleOwner | undefined = profile
        ? {
            id: row.owner_id,
            username: profile.username,
            name: profile.display_name,
          }
        : undefined;

      return mapVehicleRow(row, owner);
    },
  });

  return {
    vehicle: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
