import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { fuelLogs as mockFuelLogs } from '@/src/data/mock';
import type { FuelLog, Vehicle } from '@/src/types/models';
import { isDemoMode } from '@/src/lib/demo';
import { mapFuelLogRow, type FuelLogRow } from '@/src/lib/vehicle-db';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { useDemoGarage } from '@/src/store/demoGarage';

// Registros añadidos en modo demo durante la sesión (no hay backend).
const useDemoFuelLogs = create<{ logs: FuelLog[]; add: (log: FuelLog) => void }>((set) => ({
  logs: [],
  add: (log) => set((state) => ({ logs: [log, ...state.logs] })),
}));

export function useFuelLogs(availableVehicles: Vehicle[]) {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const demoAdded = useDemoFuelLogs((state) => state.logs);

  const vehicleKey = availableVehicles
    .map((vehicle) => vehicle.id)
    .sort()
    .join(',');

  const query = useQuery({
    queryKey: ['fuel-logs', account?.id ?? 'guest', demo ? 'demo' : 'supabase', vehicleKey],
    enabled: Boolean(account) && !demo,
    queryFn: async () => {
      if (!account || !supabase) return [];

      const { data, error } = await supabase
        .from('fuel_logs')
        .select('*')
        .eq('user_id', account.id)
        .order('filled_at', { ascending: false });

      if (error) throw new Error(error.message);

      const byId = new Map(availableVehicles.map((vehicle) => [vehicle.id, vehicle]));
      return ((data ?? []) as FuelLogRow[]).flatMap((row) => {
        const vehicle = byId.get(row.vehicle_id);
        return vehicle ? [mapFuelLogRow(row, vehicle)] : [];
      });
    },
  });

  return {
    logs: demo ? [...demoAdded, ...mockFuelLogs] : query.data ?? [],
    isDemo: demo,
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    error: demo ? null : query.error,
    refetch: query.refetch,
  };
}

export type NewFuelLogInput = {
  vehicle: Vehicle;
  volume: number;
  pricePerUnit: number;
  total: number;
  odometer: number;
  station?: string;
  fullTank?: boolean;
};

export function useAddFuelLog() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const setDemoOdometer = useDemoGarage((state) => state.setOdometer);

  return useMutation({
    mutationFn: async (input: NewFuelLogInput): Promise<FuelLog> => {
      if (demo) {
        await setDemoOdometer(input.vehicle.id, input.odometer);
        const log: FuelLog = {
          id: `fl_${Date.now()}`,
          vehicleId: input.vehicle.id,
          kind: input.vehicle.fuel === 'electric' ? 'electric' : 'fuel',
          date: 'Ahora',
          station:
            input.station ||
            (input.vehicle.fuel === 'electric' ? 'Carga registrada' : 'Repostaje registrado'),
          liters: input.vehicle.fuel === 'electric' ? 0 : Number(input.volume.toFixed(2)),
          kwh: input.vehicle.fuel === 'electric' ? Number(input.volume.toFixed(2)) : undefined,
          pricePerLiter: input.pricePerUnit,
          total: Number(input.total.toFixed(0)),
          odometer: input.odometer,
          fullTank: input.fullTank ?? true,
        };
        useDemoFuelLogs.getState().add(log);
        return log;
      }

      if (!supabase || !account) {
        throw new Error('Inicia sesión para guardar el repostaje.');
      }

      const { data, error } = await supabase
        .from('fuel_logs')
        .insert({
          user_id: account.id,
          vehicle_id: input.vehicle.id,
          odometer_km: input.odometer,
          volume_l: input.volume,
          price_per_l: input.pricePerUnit,
          total_cost: input.total,
          currency_code: 'DOP',
          station: input.station,
          is_full_tank: input.fullTank ?? true,
          filled_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error) {
        throw new Error('No pudimos guardar el repostaje. Revisa tu conexión e inténtalo de nuevo.');
      }

      // El repostaje ya está guardado; actualizar el odómetro no debe bloquear.
      await supabase
        .from('vehicles')
        .update({ odometer_km: input.odometer })
        .eq('id', input.vehicle.id)
        .eq('owner_id', account.id);

      return mapFuelLogRow(data as FuelLogRow, input.vehicle);
    },
    onSuccess: () => {
      if (!demo) {
        void queryClient.invalidateQueries({ queryKey: ['fuel-logs'] });
        void queryClient.invalidateQueries({ queryKey: ['garage'] });
      }
    },
  });
}
