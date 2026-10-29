import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { maintenanceForVehicle } from '@/src/data/maintenance';
import type { MaintenanceKind, MaintenanceRecord } from '@/src/data/mock';
import { isDemoMode } from '@/src/lib/demo';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';

type MaintenanceRow = {
  id: string;
  vehicle_id: string;
  kind: MaintenanceKind;
  title: string;
  service_date: string;
  odometer_km: number | string;
  cost: number | string;
  shop: string | null;
  notes: string | null;
  next_km: number | string | null;
};

function mapMaintenanceRow(row: MaintenanceRow): MaintenanceRecord {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    kind: row.kind,
    title: row.title,
    date: row.service_date,
    odometerKm: Number(row.odometer_km),
    cost: Number(row.cost),
    shop: row.shop?.trim() || 'Taller no registrado',
    notes: row.notes ?? undefined,
    nextKm: row.next_km == null ? undefined : Number(row.next_km),
  };
}

export function useMaintenance(vehicleId?: string, enabled = true) {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  const query = useQuery({
    queryKey: ['maintenance', vehicleId ?? 'none', demo ? 'demo' : 'supabase'],
    enabled: Boolean(vehicleId) && !demo && enabled,
    queryFn: async (): Promise<MaintenanceRecord[]> => {
      if (!vehicleId || !supabase) return [];
      const { data, error } = await supabase
        .from('vehicle_maintenance')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('service_date', { ascending: false });

      if (error) throw new Error(error.message);
      return ((data ?? []) as MaintenanceRow[]).map(mapMaintenanceRow);
    },
  });

  return {
    records: demo ? maintenanceForVehicle(vehicleId ?? '') : query.data ?? [],
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    error: demo ? null : query.error,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export type NewMaintenanceInput = {
  vehicleId: string;
  kind: MaintenanceKind;
  title: string;
  serviceDate: string;
  odometerKm: number;
  cost: number;
  shop: string;
  notes: string;
  nextKm?: number;
};

export function useAddMaintenance() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async (input: NewMaintenanceInput): Promise<MaintenanceRecord> => {
      if (demo) {
        throw new Error('Los mantenimientos reales requieren una cuenta conectada.');
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para guardar mantenimientos.');
      }

      const { data, error } = await supabase
        .from('vehicle_maintenance')
        .insert({
          vehicle_id: input.vehicleId,
          owner_id: account.id,
          kind: input.kind,
          title: input.title.trim(),
          service_date: input.serviceDate,
          odometer_km: input.odometerKm,
          cost: input.cost,
          shop: input.shop.trim() || null,
          notes: input.notes.trim() || null,
          next_km: input.nextKm ?? null,
        })
        .select('*')
        .single();

      if (error) {
        throw new Error('No pudimos guardar el mantenimiento. Inténtalo de nuevo.');
      }

      return mapMaintenanceRow(data as MaintenanceRow);
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['maintenance', variables.vehicleId],
      });
    },
  });
}
