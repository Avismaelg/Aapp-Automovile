import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { fuelLogs as mockFuelLogs } from '@/src/data/mock';
import type { FuelLog, Vehicle } from '@/src/types/models';
import { isDemoMode } from '@/src/lib/demo';
import { mapFuelLogRow, type FuelLogRow } from '@/src/lib/vehicle-db';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { useDemoGarage } from '@/src/store/demoGarage';
import { getCurrency, t } from '@/src/i18n';

// Registros añadidos o editados en modo demo durante la sesión (no hay backend).
const useDemoFuelLogs = create<{
  logs: FuelLog[];
  edits: Record<string, FuelLog>;
  add: (log: FuelLog) => void;
  replace: (log: FuelLog) => void;
}>((set) => ({
  logs: [],
  edits: {},
  add: (log) => set((state) => ({ logs: [log, ...state.logs] })),
  replace: (log) => set((state) => ({ edits: { ...state.edits, [log.id]: log } })),
}));

export function useFuelLogs(availableVehicles: Vehicle[]) {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const demoAdded = useDemoFuelLogs((state) => state.logs);
  const demoEdits = useDemoFuelLogs((state) => state.edits);

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
    logs: demo ? [...demoAdded, ...mockFuelLogs].map((log) => demoEdits[log.id] ?? log) : query.data ?? [],
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
  /** Fecha del registro (ISO); por defecto, ahora. */
  filledAt?: string;
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
          date: t('Ahora'),
          station:
            input.station ||
            (input.vehicle.fuel === 'electric' ? t('Carga registrada') : t('Repostaje registrado')),
          liters: input.vehicle.fuel === 'electric' ? 0 : Number(input.volume.toFixed(2)),
          kwh: input.vehicle.fuel === 'electric' ? Number(input.volume.toFixed(2)) : undefined,
          pricePerLiter: input.pricePerUnit,
          total: Number(input.total.toFixed(0)),
          odometer: input.odometer,
          fullTank: input.fullTank ?? true,
          filledAt: input.filledAt ?? new Date().toISOString(),
        };
        useDemoFuelLogs.getState().add(log);
        return log;
      }

      if (!supabase || !account) {
        throw new Error(t('Inicia sesión para guardar el repostaje.'));
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
          currency_code: getCurrency(),
          station: input.station,
          is_full_tank: input.fullTank ?? true,
          filled_at: input.filledAt ?? new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error) {
        throw new Error(t('No pudimos guardar el repostaje. Revisa tu conexión e inténtalo de nuevo.'));
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

// RF-09: editar un repostaje o carga ya guardado.
export function useUpdateFuelLog() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async ({ log, input }: { log: FuelLog; input: NewFuelLogInput }): Promise<void> => {
      const electric = input.vehicle.fuel === 'electric';
      if (demo) {
        useDemoFuelLogs.getState().replace({
          ...log,
          station: input.station || log.station,
          liters: electric ? 0 : Number(input.volume.toFixed(2)),
          kwh: electric ? Number(input.volume.toFixed(2)) : undefined,
          pricePerLiter: input.pricePerUnit,
          total: Number(input.total.toFixed(0)),
          odometer: input.odometer,
          fullTank: input.fullTank ?? true,
          filledAt: input.filledAt ?? log.filledAt,
        });
        return;
      }
      if (!supabase || !account) {
        throw new Error(t('Inicia sesión para guardar el repostaje.'));
      }
      const { error } = await supabase
        .from('fuel_logs')
        .update({
          odometer_km: input.odometer,
          volume_l: input.volume,
          price_per_l: input.pricePerUnit,
          total_cost: input.total,
          station: input.station ?? null,
          is_full_tank: input.fullTank ?? true,
          ...(input.filledAt ? { filled_at: input.filledAt } : {}),
        })
        .eq('id', log.id)
        .eq('user_id', account.id);
      if (error) {
        throw new Error(t('No pudimos guardar los cambios.'));
      }
    },
    onSuccess: () => {
      if (!demo) void queryClient.invalidateQueries({ queryKey: ['fuel-logs'] });
    },
  });
}
