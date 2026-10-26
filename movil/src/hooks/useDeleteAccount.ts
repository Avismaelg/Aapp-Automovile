import { useMutation, useQueryClient } from '@tanstack/react-query';

import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  const signOutLocal = useAuth((state) => state.signOutLocal);
  const account = useAuth((state) => state.account);

  return useMutation({
    mutationFn: async () => {
      if (account?.mode === 'demo' || !isSupabaseConfigured || !supabase) {
        throw new Error('Eliminar la cuenta requiere una cuenta real conectada.');
      }

      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: {},
      });

      if (error) {
        let message = error.message;
        const context = (error as { context?: Response }).context;
        if (context) {
          try {
            const payload = (await context.clone().json()) as { error?: string };
            if (payload.error) message = payload.error;
          } catch {
            // Usamos el mensaje original si el cuerpo no es JSON.
          }
        }
        throw new Error(message);
      }

      if (!data?.ok) {
        throw new Error('No pudimos eliminar la cuenta. Inténtalo de nuevo.');
      }

      queryClient.clear();
      await signOutLocal();
    },
  });
}
