import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';

import type { Vehicle } from '@/src/data/mock';
import {
  demoQrSlug,
  demoVehicleId,
  mapVehicleRow,
  vehicleInsertPayload,
  type NewVehicleInput,
  type VehicleRow,
} from '@/src/lib/vehicle-db';
import { vehicleUrl } from '@/src/lib/qr';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { useDemoGarage } from '@/src/store/demoGarage';

function isDemoAccount(mode: string | undefined) {
  return mode === 'demo' || !isSupabaseConfigured || !supabase;
}

export function useGarageVehicles() {
  const account = useAuth((state) => state.account);
  const demo = isDemoAccount(account?.mode);
  const demoVehicles = useDemoGarage((state) => state.vehicles);
  const hydrateDemo = useDemoGarage((state) => state.hydrate);

  useEffect(() => {
    if (demo) void hydrateDemo();
  }, [demo, hydrateDemo]);

  const query = useQuery({
    queryKey: ['garage', account?.id ?? 'guest', demo ? 'demo' : 'supabase'],
    enabled: Boolean(account) && !demo,
    queryFn: async () => {
      if (!account || !supabase) return [];

      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('owner_id', account.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      const owner = {
        id: account.id,
        username: account.username,
        name: account.displayName,
      };
      return ((data ?? []) as VehicleRow[]).map((row) => mapVehicleRow(row, owner));
    },
  });

  return {
    vehicles: demo ? demoVehicles : query.data ?? [],
    isDemo: demo,
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    error: demo ? null : query.error,
    refetch: query.refetch,
  };
}

function friendlyGarageError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('duplicate key')) {
    return 'Ese vehículo ya existe o hay un conflicto con el vehículo principal.';
  }
  if (normalized.includes('row-level security') || normalized.includes('permission')) {
    return 'Tu sesión no tiene permiso para guardar este vehículo. Vuelve a iniciar sesión.';
  }
  return 'No pudimos guardar el vehículo. Revisa tu conexión e inténtalo de nuevo.';
}

// Abre la galería y, si elige una, la recorta a 4:3.
export async function pickVehiclePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Necesitamos permiso para ver tus fotos.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.7,
  });

  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

export function useSetVehiclePhoto() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoAccount(account?.mode);
  const setDemoPhoto = useDemoGarage((state) => state.setPhoto);

  return useMutation({
    mutationFn: async ({ vehicleId, uri }: { vehicleId: string; uri: string }) => {
      if (demo) {
        // En demo no hay Storage: mostramos la foto local (valida hasta borrar la app).
        await setDemoPhoto(vehicleId, uri);
        return uri;
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para subir la foto.');
      }

      const file = await fetch(uri);
      if (!file.ok) throw new Error('No pudimos leer la foto elegida.');
      const bytes = await file.arrayBuffer();

      const path = `${account.id}/${vehicleId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('vehicles')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        throw new Error('No pudimos subir la foto. Revisa tu conexión e inténtalo de nuevo.');
      }

      const { data: publicUrl } = supabase.storage.from('vehicles').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ photo_url: publicUrl.publicUrl })
        .eq('id', vehicleId)
        .eq('owner_id', account.id);

      if (updateError) {
        throw new Error('La foto se subió pero no pudimos guardarla en el vehículo.');
      }

      return publicUrl.publicUrl;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['garage'] });
    },
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoAccount(account?.mode);
  const addDemoVehicle = useDemoGarage((state) => state.addVehicle);

  return useMutation({
    mutationFn: async (input: NewVehicleInput): Promise<Vehicle> => {
      if (demo) {
        const qrSlug = demoQrSlug(input.make, input.model);
        const vehicle: Vehicle = {
          id: demoVehicleId(),
          make: input.make.trim(),
          model: input.model.trim(),
          year: input.year,
          nickname: input.nickname?.trim() || `${input.make.trim()} ${input.model.trim()}`,
          color: input.color,
          odometerKm: input.odometerKm,
          kind: input.kind,
          fuel: input.fuel,
          efficiency: input.efficiency,
          efficiencyUnit: input.kind === 'ev' ? 'kwh_100km' : 'km_l',
          qrSlug,
          qr: vehicleUrl(qrSlug),
          isPrimary: Boolean(input.isPrimary),
          ownerId: account?.id,
          ownerUsername: account?.username,
          ownerName: account?.displayName,
          acquiredAt: new Date().toISOString(),
        };

        await addDemoVehicle(vehicle);
        return vehicle;
      }

      if (!supabase || !account) {
        throw new Error('Inicia sesión para guardar tu vehículo.');
      }

      if (input.isPrimary) {
        const { error: clearError } = await supabase
          .from('vehicles')
          .update({ is_primary: false })
          .eq('owner_id', account.id)
          .eq('is_primary', true);

        if (clearError) throw new Error(friendlyGarageError(clearError.message));
      }

      const { data, error } = await supabase
        .from('vehicles')
        .insert(vehicleInsertPayload(account.id, input))
        .select('*')
        .single();

      if (error) throw new Error(friendlyGarageError(error.message));
      return mapVehicleRow(data as VehicleRow, {
        id: account.id,
        username: account.username,
        name: account.displayName,
      });
    },
    onSuccess: () => {
      if (!demo) {
        void queryClient.invalidateQueries({ queryKey: ['garage'] });
      }
    },
  });
}
