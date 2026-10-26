import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Card, Pill } from '@/src/components/ui';
import type { FeedPost } from '@/src/hooks/useFeed';
import { timeAgo } from '@/src/lib/format';
import { profileColor } from '@/src/lib/profile-db';
import { colors, radius, spacing } from '@/src/theme';

const kindLabels: Record<FeedPost['kind'], string> = {
  drive: 'Ruta',
  photo: 'Foto',
  party: 'Party',
  achievement: 'Logro',
  text: 'Publicación',
};

export function PostCard({
  post,
  liking,
  onToggleLike,
  onPressComment,
}: {
  post: FeedPost;
  liking?: boolean;
  onToggleLike: () => void;
  onPressComment?: () => void;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Avatar
          name={post.author.displayName}
          color={profileColor(post.author.username)}
          size={38}
          uri={post.author.avatarUrl ?? undefined}
          online
        />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{post.author.displayName}</AppText>
          <AppText variant="caption" color={colors.muted}>
            @{post.author.username} · {timeAgo(post.createdAt)}
          </AppText>
        </View>
        <Pill label={kindLabels[post.kind]} tone="neutral" />
      </View>

      <AppText variant="body" style={styles.caption}>
        {post.caption}
      </AppText>

      {post.vehicleLabel ? (
        <View style={styles.vehicleRow}>
          <Ionicons name="car-sport-outline" size={13} color={colors.accent} />
          <AppText variant="caption" color={colors.textSoft}>
            {post.vehicleLabel}
          </AppText>
        </View>
      ) : null}

      {post.kind === 'photo' ? (
        <LinearGradient colors={['#2A1B3D', '#FF5A1F']} style={styles.photo}>
          <Ionicons name="car-sport" size={54} color="rgba(255,255,255,0.22)" />
        </LinearGradient>
      ) : null}

      <View style={styles.footer}>
        <Pressable
          style={styles.action}
          onPress={onToggleLike}
          disabled={liking}
          hitSlop={6}
        >
          <Ionicons
            name={post.likedByMe ? 'heart' : 'heart-outline'}
            size={18}
            color={post.likedByMe ? colors.accent : colors.muted}
          />
          <AppText variant="caption" color={post.likedByMe ? colors.accent : colors.muted}>
            {post.likeCount}
          </AppText>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={onPressComment}
          disabled={!onPressComment}
          hitSlop={6}
        >
          <Ionicons name="chatbubble-outline" size={17} color={colors.muted} />
          <AppText variant="caption" color={colors.muted}>{post.commentCount}</AppText>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Ionicons name="paper-plane-outline" size={17} color={colors.muted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  caption: {
    marginTop: spacing.md,
    lineHeight: 21,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photo: {
    height: 190,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
