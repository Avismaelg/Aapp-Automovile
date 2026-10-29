import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';

import type { Vehicle } from '@/src/types/models';
import { isDemoMode } from '@/src/lib/demo';
import {
  demoQrSlug,
  demoVehicleId,
  mapVehicleRow,
  vehicleInsertPayload,
  type NewVehicleInput,
  type VehicleRow,
} from '@/src/lib/vehicle-db';
import { vehicleUrl } from '@/src/lib/qr';
import { supabase } from '@/src/lib/supabase';
import { useAuth, type Account } from '@/src/store/auth';
import { useDemoGarage } from '@/src/store/demoGarage';

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TOO_LARGE = 'La foto es demasiado grande. Usa una imagen de 8 MB o menos.';

function ownerOf(account: Account) {
  return { id: account.id, username: account.username, name: account.displayName };
}

// Campos editables comunes a crear y editar en modo demo.
function demoVehicleFields(input: NewVehicleInput) {
  const make = input.make.trim();
  const model = input.model.trim();
  return {
    make,
    model,
    year: input.year,
    nickname: input.nickname?.trim() || `${make} ${model}`,
    color: input.color,
    odometerKm: input.odometerKm,
    kind: input.kind,
    fuel: input.fuel,
    efficiency: input.efficiency,
    efficiencyUnit: input.kind === 'ev' ? 'kwh_100km' : 'km_l',
    isPrimary: Boolean(input.isPrimary),
  } satisfies Partial<Vehicle>;
}

function photoExtension(mimeType: string) {
  const subtype = mimeType.split('/')[1]?.toLowerCase() ?? 'jpeg';
  if (subtype === 'jpeg' || subtype === 'pjpeg') return 'jpg';
  return /^[a-z0-9]+$/.test(subtype) ? subtype : 'jpg';
}

export function useGarageVehicles() {
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
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
      const owner = ownerOf(account);
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

export type VehiclePhotoSelection = {
  uri: string;
  mimeType: string;
};

// Abre la galería y, si elige una, la recorta a 4:3.
export async function pickVehiclePhoto(): Promise<VehiclePhotoSelection | null> {
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
  const asset = result.assets[0];
  if (asset.type !== 'image') throw new Error('El archivo elegido no es una imagen.');
  if (asset.fileSize != null && asset.fileSize > MAX_PHOTO_BYTES) {
    throw new Error(PHOTO_TOO_LARGE);
  }
  return {
    uri: asset.uri,
    mimeType: asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg',
  };
}

export function useSetVehiclePhoto() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const setDemoPhoto = useDemoGarage((state) => state.setPhoto);

  return useMutation({
    mutationFn: async ({ vehicleId, photo }: { vehicleId: string; photo: VehiclePhotoSelection }) => {
      if (demo) {
        // En demo no hay Storage: mostramos la foto local (valida hasta borrar la app).
        await setDemoPhoto(vehicleId, photo.uri);
        return photo.uri;
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para subir la foto.');
      }

      const file = await fetch(photo.uri);
      if (!file.ok) throw new Error('No pudimos leer la foto elegida.');
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > MAX_PHOTO_BYTES) {
        throw new Error(PHOTO_TOO_LARGE);
      }

      const path = `${account.id}/${vehicleId}/${Date.now()}.${photoExtension(photo.mimeType)}`;
      const { error: uploadError } = await supabase.storage
        .from('vehicles')
        .upload(path, bytes, { contentType: photo.mimeType, upsert: true });

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
  const demo = isDemoMode(account?.mode);
  const addDemoVehicle = useDemoGarage((state) => state.addVehicle);

  return useMutation({
    mutationFn: async (input: NewVehicleInput): Promise<Vehicle> => {
      if (demo) {
        const qrSlug = demoQrSlug(input.make, input.model);
        const vehicle: Vehicle = {
          id: demoVehicleId(),
          ...demoVehicleFields(input),
          qrSlug,
          qr: vehicleUrl(qrSlug),
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

      // El trigger vehicles_single_primary desmarca el principal anterior.
      const { data, error } = await supabase
        .from('vehicles')
        .insert(vehicleInsertPayload(account.id, input))
        .select('*')
        .single();

      if (error) throw new Error(friendlyGarageError(error.message));
      return mapVehicleRow(data as VehicleRow, ownerOf(account));
    },
    onSuccess: () => {
      if (!demo) {
        void queryClient.invalidateQueries({ queryKey: ['garage'] });
      }
    },
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const updateDemoVehicle = useDemoGarage((state) => state.updateVehicle);

  return useMutation({
    mutationFn: async ({ vehicleId, input }: { vehicleId: string; input: NewVehicleInput }) => {
      if (demo) {
        const current = useDemoGarage.getState().vehicles.find((item) => item.id === vehicleId);
        if (!current) throw new Error('No encontramos ese vehículo.');

        const updated: Vehicle = { ...current, ...demoVehicleFields(input) };

        await updateDemoVehicle(vehicleId, updated);
        return updated;
      }

      if (!supabase || !account) {
        throw new Error('Inicia sesión para editar tu vehículo.');
      }

      // El trigger vehicles_single_primary desmarca el principal anterior.
      const payload = vehicleInsertPayload(account.id, input);
      const { owner_id: _ownerId, ...updates } = payload;
      const { data, error } = await supabase
        .from('vehicles')
        .update(updates)
        .eq('id', vehicleId)
        .eq('owner_id', account.id)
        .select('*')
        .single();

      if (error) throw new Error(friendlyGarageError(error.message));
      return mapVehicleRow(data as VehicleRow, ownerOf(account));
    },
    onSuccess: () => {
      if (!demo) void queryClient.invalidateQueries({ queryKey: ['garage'] });
    },
  });
}
