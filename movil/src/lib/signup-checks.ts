import { normalizeNickname } from '@/src/lib/signup-validation';
import { supabase } from '@/src/lib/supabase';

// REG-02: comprobación en vivo contra el servidor. Si el servidor
// aún no tiene la función (migración sin aplicar) o no hay red, devuelve
// null («no se sabe») y el alta lo comprueba igualmente al final.

export async function isNicknameAvailable(nickname: string): Promise<boolean | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('username_available', {
    p_username: normalizeNickname(nickname),
  });
  if (error || typeof data !== 'boolean') return null;
  return data;
}

