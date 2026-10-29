import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

// Sin backend configurado toda la app funciona con datos locales de demo.
export function isDemoMode(mode: string | undefined) {
  return mode === 'demo' || !isSupabaseConfigured || !supabase;
}
