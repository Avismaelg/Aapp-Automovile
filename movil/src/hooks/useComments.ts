import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId } from 'react';

import {
  mapProfileRow,
  PROFILE_COLUMNS,
  type ProfileRow,
  type UserProfile,
} from '@/src/lib/profile-db';
import { isDemoMode } from '@/src/lib/demo';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';

export type PostComment = {
  id: string;
  postId: string;
  userId: string;
  profile: UserProfile;
  body: string;
  createdAt: string;
  isMe: boolean;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
};

function fallbackProfile(id: string): UserProfile {
  return {
    id,
    username: 'piloto',
    displayName: 'Piloto',
    bio: '',
    city: '',
    countryCode: 'DO',
    avatarUrl: null,
    privacy: 'public',
    qrSlug: `piloto-${id.slice(0, 6)}`,
    createdAt: new Date().toISOString(),
  };
}

export function useComments(postId: string | undefined) {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);
  const channelId = useId().replace(/:/g, '');

  const query = useQuery({
    queryKey: ['comments', postId ?? 'none', demo ? 'demo' : 'supabase'],
    enabled: Boolean(postId) && !demo,
    queryFn: async (): Promise<PostComment[]> => {
      if (!postId || !account || !supabase) return [];

      const { data, error } = await supabase
        .from('comments')
        .select('id, post_id, user_id, body, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      const rows = (data ?? []) as CommentRow[];
      const userIds = [...new Set(rows.map((row) => row.user_id))];
      const { data: profileRows, error: profileError } = userIds.length
        ? await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', userIds)
        : { data: [], error: null };

      if (profileError) throw new Error(profileError.message);
      const profileMap = new Map(
        ((profileRows ?? []) as ProfileRow[]).map((row) => [row.id, mapProfileRow(row)]),
      );

      return rows.map((row) => ({
        id: row.id,
        postId: row.post_id,
        userId: row.user_id,
        profile: profileMap.get(row.user_id) ?? fallbackProfile(row.user_id),
        body: row.body,
        createdAt: row.created_at,
        isMe: row.user_id === account.id,
      }));
    },
  });

  useEffect(() => {
    if (demo || !supabase || !postId) return;
    const channel = supabase
      .channel(`post-comments-${postId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['comments', postId] });
          void queryClient.invalidateQueries({ queryKey: ['feed'] });
          void queryClient.invalidateQueries({ queryKey: ['post', postId] });
        },
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [channelId, demo, postId, queryClient]);

  return {
    comments: demo ? [] : query.data ?? [],
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export function useAddComment() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
      if (demo) throw new Error('Los comentarios reales requieren una cuenta.');
      if (!supabase || !account) throw new Error('Inicia sesión para comentar.');
      if (!body.trim()) throw new Error('Escribe un comentario.');

      const { error } = await supabase.from('comments').insert({
        post_id: postId,
        user_id: account.id,
        body: body.trim(),
      });

      if (error) throw new Error('No pudimos publicar el comentario.');
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['comments', variables.postId] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['post', variables.postId] });
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = isDemoMode(account?.mode);

  return useMutation({
    mutationFn: async ({ id, postId }: { id: string; postId: string }) => {
      if (demo) throw new Error('Los comentarios reales requieren una cuenta.');
      if (!supabase || !account) throw new Error('Inicia sesión para borrar comentarios.');

      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw new Error('No pudimos borrar el comentario.');
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['comments', variables.postId] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['post', variables.postId] });
    },
  });
}
