import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthNotice } from '@/src/components/auth';
import { PostCard } from '@/src/components/PostCard';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Input,
} from '@/src/components/ui';
import {
  useAddComment,
  useComments,
  useDeleteComment,
} from '@/src/hooks/useComments';
import { usePost, useToggleLike } from '@/src/hooks/useFeed';
import { errorMessage } from '@/src/lib/alerts';
import { timeAgo } from '@/src/lib/format';
import { profileColor } from '@/src/lib/profile-db';
import { colors, spacing } from '@/src/theme';

export default function PostDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { post, isLoading, isError, refetch } = usePost(id);
  const { comments, isLoading: commentsLoading, isError: commentsError, refetch: refetchComments } =
    useComments(id);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const toggleLike = useToggleLike();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const send = async () => {
    if (!id || !body.trim()) return;
    setError(null);
    try {
      await addComment.mutateAsync({ postId: id, body });
      setBody('');
    } catch (sendError) {
      setError(
        errorMessage(sendError, 'No pudimos comentar.'),
      );
    }
  };

  const remove = (commentId: string) => {
    const perform = async () => {
      try {
        await deleteComment.mutateAsync({ id: commentId, postId: id });
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : 'No pudimos borrar el comentario.',
        );
      }
    };

    if (Platform.OS === 'web') {
      void perform();
      return;
    }
    Alert.alert('Borrar comentario', '¿Quieres eliminar este comentario?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => void perform() },
    ]);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="caption" color={colors.muted}>Cargando publicación…</AppText>
      </SafeAreaView>
    );
  }

  if (isError || !post) {
    return (
      <SafeAreaView style={styles.state} edges={['top', 'bottom']}>
        <Ionicons name="document-text-outline" size={34} color={colors.dim} />
        <AppText variant="title" align="center">Publicación no disponible</AppText>
        <AppText variant="caption" color={colors.muted} align="center">
          Puede ser privada o haber sido eliminada.
        </AppText>
        <Button
          label="Reintentar"
          variant="secondary"
          onPress={() => void refetch()}
          style={{ marginTop: spacing.md }}
        />
        <Button label="Volver" variant="ghost" onPress={goBack} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <IconButton icon="arrow-back" size={40} onPress={goBack} />
          <View style={{ flex: 1 }}>
            <AppText variant="label" color={colors.accent}>PUBLICACIÓN</AppText>
            <AppText variant="title">Comentarios</AppText>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PostCard
            post={post}
            liking={toggleLike.isPending}
            onToggleLike={() =>
              void toggleLike.mutateAsync({
                postId: post.id,
                liked: post.likedByMe,
              })
            }
          />

          <View style={styles.commentsHeader}>
            <AppText variant="h2">Comentarios</AppText>
            <AppText variant="caption" color={colors.muted}>
              {comments.length}
            </AppText>
          </View>

          {error ? <AuthNotice message={error} /> : null}

          {commentsLoading ? (
            <View style={styles.commentsState}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : commentsError ? (
            <Card style={styles.commentEmpty}>
              <AppText variant="bodyStrong">No pudimos cargar los comentarios</AppText>
              <Button
                label="Reintentar"
                size="sm"
                variant="secondary"
                onPress={() => void refetchComments()}
              />
            </Card>
          ) : comments.length === 0 ? (
            <Card style={styles.commentEmpty}>
              <View style={styles.commentEmptyIcon}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.accent} />
              </View>
              <AppText variant="title" align="center">Sé el primero en comentar</AppText>
              <AppText variant="caption" color={colors.muted} align="center">
                Pregunta por la ruta, el coche o la quedada.
              </AppText>
            </Card>
          ) : (
            <View style={styles.commentList}>
              {comments.map((comment) => (
                <View key={comment.id} style={styles.comment}>
                  <Avatar
                    name={comment.profile.displayName}
                    color={profileColor(comment.profile.username)}
                    size={34}
                    uri={comment.profile.avatarUrl ?? undefined}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={styles.commentTop}>
                      <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                        {comment.isMe ? 'Tú' : comment.profile.displayName}
                      </AppText>
                      <AppText variant="caption" color={colors.dim}>
                        {timeAgo(comment.createdAt)}
                      </AppText>
                    </View>
                    <AppText variant="body" color={colors.textSoft} style={{ marginTop: 2 }}>
                      {comment.body}
                    </AppText>
                  </View>
                  {comment.isMe ? (
                    <Pressable
                      onPress={() => remove(comment.id)}
                      hitSlop={8}
                      disabled={deleteComment.isPending}
                    >
                      <Ionicons name="trash-outline" size={15} color={colors.dim} />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <Input
            value={body}
            onChangeText={(value) => {
              setBody(value.slice(0, 500));
              setError(null);
            }}
            placeholder="Escribe un comentario…"
            multiline
            maxLength={500}
            style={styles.composerInput}
            rightSlot={
              <Pressable
                onPress={() => void send()}
                disabled={!body.trim() || addComment.isPending}
                hitSlop={8}
                style={[
                  styles.sendButton,
                  (!body.trim() || addComment.isPending) && styles.sendButtonDisabled,
                ]}
              >
                {addComment.isPending ? (
                  <ActivityIndicator size="small" color="#120802" />
                ) : (
                  <Ionicons name="send" size={16} color="#120802" />
                )}
              </Pressable>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  state: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing['3xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  commentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  commentsState: { paddingVertical: spacing.xl, alignItems: 'center' },
  commentEmpty: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    gap: spacing.sm,
  },
  commentEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentList: { gap: spacing.md },
  comment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  commentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  composerInput: { marginBottom: 0 },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.35 },
});
