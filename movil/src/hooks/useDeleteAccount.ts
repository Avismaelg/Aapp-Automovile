import { useMutation, useQueryClient } from '@tanstack/react-query';

import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';
import { t } from '@/src/i18n';
import { extractFunctionError } from '@/src/lib/alerts';

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const signOutLocal = useAuth((state) => state.signOutLocal);
  const account = useAuth((state) => state.account);

  return useMutation({
    mutationFn: async () => {
      if (account?.mode === 'demo' || !isSupabaseConfigured || !supabase) {
        throw new Error(t('Eliminar la cuenta requiere una cuenta real conectada.'));
      }

      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: {},
      });

      if (error) {
        throw new Error((await extractFunctionError(error)).message);
      }

      if (!data?.ok) {
        throw new Error(t('No pudimos eliminar la cuenta. Inténtalo de nuevo.'));
      }

      queryClient.clear();
      await signOutLocal();
      // P1-4: la cuenta ya no existe, pero quizá queden archivos por borrar
      // (el servidor los reintenta solo).
      return { storage: (data.storage as 'complete' | 'partial' | undefined) ?? 'complete' };
    },
  });
}
