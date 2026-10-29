import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppText, Avatar, Card, Pill } from '@/src/components/ui';
import type { FeedItem } from '@/src/types/models';
import { timeAgo } from '@/src/lib/format';
import { colors, radius, spacing } from '@/src/theme';

function MiniRoute({ seed = 1 }: { seed?: number }) {
  const paths = [
    'M10 52 C 32 44, 38 20, 64 26 S 96 44, 122 18 S 156 12, 180 24',
    'M8 20 C 44 46, 60 10, 92 28 S 132 50, 176 22',
    'M12 40 C 40 18, 60 48, 88 22 S 142 14, 178 36',
  ];
  return (
    <View style={styles.miniRoute}>
      <Svg width="100%" height="100%" viewBox="0 0 190 64">
        <Path d={paths[seed % paths.length]} stroke="#26313E" strokeWidth={9} fill="none" strokeLinecap="round" />
        <Path d={paths[seed % paths.length]} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <Circle cx={10} cy={seed === 1 ? 52 : 34} r={3.5} fill={colors.lime} />
        <Circle cx={179} cy={seed === 1 ? 24 : 28} r={4} fill={colors.accent} />
      </Svg>
      <View style={styles.routeTag}>
        <Ionicons name="navigate" size={10} color={colors.textSoft} />
        <AppText variant="label" style={{ fontSize: 8 }}>
          RUTA
        </AppText>
      </View>
    </View>
  );
}

function Footer({
  likes,
  comments,
  onLike,
  liked,
}: {
  likes: number;
  comments: number;
  liked: boolean;
  onLike: () => void;
}) {
  return (
    <View style={styles.footer}>
      <Pressable style={styles.action} onPress={onLike} hitSlop={6}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={18}
          color={liked ? colors.accent : colors.muted}
        />
        <AppText variant="caption" color={liked ? colors.accent : colors.muted}>
          {likes + (liked ? 1 : 0)}
        </AppText>
      </Pressable>
      <Pressable style={styles.action} hitSlop={6}>
        <Ionicons name="chatbubble-outline" size={17} color={colors.muted} />
        <AppText variant="caption" color={colors.muted}>
          {comments}
        </AppText>
      </Pressable>
      <View style={{ flex: 1 }} />
      <Pressable style={styles.action} hitSlop={6}>
        <Ionicons name="paper-plane-outline" size={17} color={colors.muted} />
      </Pressable>
      <Pressable style={styles.action} hitSlop={6}>
        <Ionicons name="bookmark-outline" size={17} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export function FeedCard({ item }: { item: FeedItem }) {
  const [liked, setLiked] = useState(false);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Avatar name={item.author.name} color={item.author.color} size={38} online={item.author.online} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{item.author.name}</AppText>
          <AppText variant="caption" color={colors.muted}>
            {item.author.car} · {timeAgo(item.createdAt)}
          </AppText>
        </View>
        <Pressable hitSlop={8}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
        </Pressable>
      </View>

      {item.type === 'drive' ? (
        <View style={{ marginTop: spacing.md }}>
          <View style={styles.driveHeading}>
            <View style={{ flex: 1 }}>
              <AppText variant="title">{item.title}</AppText>
              {item.note ? (
                <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
                  {item.note}
                </AppText>
              ) : null}
            </View>
            <Pill label="Automático" tone="lime" icon="flash" />
          </View>
          <MiniRoute seed={item.routeSeed} />
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <AppText variant="h3">{item.distanceKm} km</AppText>
              <AppText variant="caption" color={colors.muted}>distancia</AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <AppText variant="h3">{item.durationMin} min</AppText>
              <AppText variant="caption" color={colors.muted}>duración</AppText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <AppText variant="h3">{item.avgSpeed} km/h</AppText>
              <AppText variant="caption" color={colors.muted}>media</AppText>
            </View>
          </View>
        </View>
      ) : null}

      {item.type === 'photo' ? (
        <View style={{ marginTop: spacing.md }}>
          <LinearGradient colors={item.gradient} style={styles.photo}>
            <Ionicons name="car-sport" size={64} color="rgba(255,255,255,0.24)" />
            <View style={styles.photoOverlay}>
              <AppText variant="body" color={colors.white}>
                {item.caption}
              </AppText>
            </View>
          </LinearGradient>
        </View>
      ) : null}

      {item.type === 'party' ? (
        <LinearGradient
          colors={['#22140D', '#10151B']}
          style={styles.partyCard}
        >
          <View style={styles.partyTop}>
            <Pill label="Party finalizada" tone="accent" icon="radio" />
            <AppText variant="caption" color={colors.muted}>7 coches</AppText>
          </View>
          <AppText variant="h2" style={{ marginTop: 10 }}>{item.title}</AppText>
          <AppText variant="caption" color={colors.muted}>
            {item.distanceKm} km juntos · 1 h 12 min
          </AppText>
          <View style={styles.partyBottom}>
            <View style={styles.stack}>
              {[colors.accent, colors.lime, colors.cyan, '#B98CFF'].map((c, i) => (
                <View key={c} style={[styles.stackDot, { backgroundColor: c, marginLeft: i === 0 ? 0 : -8 }]} />
              ))}
            </View>
            <View style={styles.partyLink}>
              <Ionicons name="play-circle" size={15} color={colors.accent} />
              <AppText variant="label" color={colors.accent}>Ver resumen</AppText>
            </View>
          </View>
        </LinearGradient>
      ) : null}

      {item.type === 'achievement' ? (
        <View style={styles.achievement}>
          <View style={styles.achievementIcon}>
            <Ionicons name="trophy" size={24} color={colors.lime} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title">{item.title}</AppText>
            <AppText variant="caption" color={colors.muted}>{item.subtitle}</AppText>
          </View>
        </View>
      ) : null}

      <Footer
        likes={item.likes}
        comments={item.comments}
        liked={liked}
        onLike={() => setLiked((v) => !v)}
      />
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
  driveHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  miniRoute: {
    height: 74,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  routeTag: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6,9,13,0.8)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  photo: {
    height: 230,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  partyCard: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  partyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  partyBottom: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#10151B',
  },
  partyLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  achievement: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(201,255,77,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.18)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  achievementIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(201,255,77,0.12)',
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
