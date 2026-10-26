import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  mapProfileRow,
  PROFILE_COLUMNS,
  type ProfileRow,
  type UserProfile,
} from '@/src/lib/profile-db';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/store/auth';

export type FeedPostKind = 'drive' | 'photo' | 'party' | 'achievement' | 'text';
export type FeedVisibility = 'public' | 'friends' | 'private';

export type FeedPost = {
  id: string;
  kind: FeedPostKind;
  caption: string;
  visibility: FeedVisibility;
  createdAt: string;
  author: UserProfile;
  vehicleLabel?: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

type PostRow = {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  kind: FeedPostKind;
  caption: string | null;
  visibility: FeedVisibility;
  created_at: string;
};

function demoMode(mode: string | undefined) {
  return mode === 'demo' || !isSupabaseConfigured || !supabase;
}

export function useFeed() {
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  const query = useQuery({
    queryKey: ['feed', account?.id ?? 'guest', demo ? 'demo' : 'supabase'],
    enabled: Boolean(account) && !demo,
    queryFn: async (): Promise<FeedPost[]> => {
      if (!account || !supabase) return [];

      const { data: rows, error } = await supabase
        .from('posts')
        .select('id, user_id, vehicle_id, kind, caption, visibility, created_at')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw new Error(error.message);
      const posts = (rows ?? []) as PostRow[];
      if (posts.length === 0) return [];

      const userIds = [...new Set(posts.map((post) => post.user_id))];
      const vehicleIds = [
        ...new Set(posts.map((post) => post.vehicle_id).filter((id): id is string => Boolean(id))),
      ];
      const postIds = posts.map((post) => post.id);

      const [profilesResult, vehiclesResult, likesResult, commentsResult] = await Promise.all([
        supabase.from('profiles').select(PROFILE_COLUMNS).in('id', userIds),
        vehicleIds.length
          ? supabase.from('vehicles').select('id, make, model').in('id', vehicleIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('likes').select('post_id, user_id').in('post_id', postIds),
        supabase.from('comments').select('post_id').in('post_id', postIds),
      ]);

      if (profilesResult.error) throw new Error(profilesResult.error.message);
      if (vehiclesResult.error) throw new Error(vehiclesResult.error.message);
      if (likesResult.error) throw new Error(likesResult.error.message);
      if (commentsResult.error) throw new Error(commentsResult.error.message);

      const profileMap = new Map(
        ((profilesResult.data ?? []) as ProfileRow[]).map((row) => [
          row.id,
          mapProfileRow(row),
        ]),
      );
      const vehicleMap = new Map(
        ((vehiclesResult.data ?? []) as { id: string; make: string; model: string }[]).map(
          (vehicle) => [vehicle.id, `${vehicle.make} ${vehicle.model}`],
        ),
      );
      const likeRows = (likesResult.data ?? []) as { post_id: string; user_id: string }[];
      const commentRows = (commentsResult.data ?? []) as { post_id: string }[];

      return posts.flatMap((post) => {
        const author = profileMap.get(post.user_id);
        if (!author) return [];
        const postLikes = likeRows.filter((like) => like.post_id === post.id);
        return [
          {
            id: post.id,
            kind: post.kind,
            caption: post.caption ?? '',
            visibility: post.visibility,
            createdAt: post.created_at,
            author,
            vehicleLabel: post.vehicle_id
              ? vehicleMap.get(post.vehicle_id)
              : undefined,
            likeCount: postLikes.length,
            commentCount: commentRows.filter((comment) => comment.post_id === post.id).length,
            likedByMe: postLikes.some((like) => like.user_id === account.id),
          },
        ];
      });
    },
  });

  return {
    posts: demo ? [] : query.data ?? [],
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    error: demo ? null : query.error,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export function usePost(postId: string | undefined) {
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  const query = useQuery({
    queryKey: ['post', postId ?? 'none', account?.id ?? 'guest', demo ? 'demo' : 'supabase'],
    enabled: Boolean(postId) && Boolean(account) && !demo,
    queryFn: async (): Promise<FeedPost | null> => {
      if (!postId || !account || !supabase) return null;

      const { data: row, error } = await supabase
        .from('posts')
        .select('id, user_id, vehicle_id, kind, caption, visibility, created_at')
        .eq('id', postId)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!row) return null;
      const post = row as PostRow;

      const [profileResult, vehicleResult, likesResult, commentsResult] =
        await Promise.all([
          supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', post.user_id).maybeSingle(),
          post.vehicle_id
            ? supabase
                .from('vehicles')
                .select('id, make, model')
                .eq('id', post.vehicle_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase.from('likes').select('user_id').eq('post_id', post.id),
          supabase.from('comments').select('id').eq('post_id', post.id),
        ]);

      if (profileResult.error) throw new Error(profileResult.error.message);
      if (vehicleResult.error) throw new Error(vehicleResult.error.message);
      if (likesResult.error) throw new Error(likesResult.error.message);
      if (commentsResult.error) throw new Error(commentsResult.error.message);
      if (!profileResult.data) return null;

      const likes = (likesResult.data ?? []) as { user_id: string }[];
      const vehicle = vehicleResult.data as
        | { id: string; make: string; model: string }
        | null;

      return {
        id: post.id,
        kind: post.kind,
        caption: post.caption ?? '',
        visibility: post.visibility,
        createdAt: post.created_at,
        author: mapProfileRow(profileResult.data as ProfileRow),
        vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model}` : undefined,
        likeCount: likes.length,
        commentCount: (commentsResult.data ?? []).length,
        likedByMe: likes.some((like) => like.user_id === account.id),
      };
    },
  });

  return {
    post: demo ? null : query.data ?? null,
    isLoading: demo ? false : query.isLoading,
    isError: demo ? false : query.isError,
    refetch: query.refetch,
    isDemo: demo,
  };
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  return useMutation({
    mutationFn: async (input: {
      caption: string;
      visibility: FeedVisibility;
    }) => {
      if (demo) {
        throw new Error('Publicar en el feed requiere una cuenta real.');
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para publicar.');
      }
      if (!input.caption.trim()) {
        throw new Error('Escribe algo antes de publicar.');
      }

      const { error } = await supabase.from('posts').insert({
        user_id: account.id,
        kind: 'text',
        caption: input.caption.trim(),
        visibility: input.visibility,
      });

      if (error) {
        throw new Error('No pudimos publicar. Inténtalo de nuevo.');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useToggleLike() {
  const queryClient = useQueryClient();
  const account = useAuth((state) => state.account);
  const demo = demoMode(account?.mode);

  return useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      if (demo) {
        throw new Error('Los likes necesitan una cuenta real.');
      }
      if (!supabase || !account) {
        throw new Error('Inicia sesión para dar me gusta.');
      }

      if (liked) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', account.id);
        if (error) throw new Error(error.message);
        return;
      }

      const { error } = await supabase.from('likes').insert({
        post_id: postId,
        user_id: account.id,
      });
      if (error && error.code !== '23505') {
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
