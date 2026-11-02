import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { secureSessionStorage } from '@/src/lib/secure-session-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const isProductionBuild = process.env.EXPO_PUBLIC_APP_ENV === 'production';

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        // SW-01: sesión en el almacenamiento seguro del dispositivo.
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        // En web el enlace de confirmación de Supabase puede crear la sesión
        // directamente. En nativo hará falta manejar el deep link (fase 2).
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;
