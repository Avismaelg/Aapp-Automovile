import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { FeedCard } from '@/src/components/FeedCard';
import { PostCard } from '@/src/components/PostCard';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Screen,
  SectionHeader,
} from '@/src/components/ui';
import { activeChallenge, feed, friends as demoFriends } from '@/src/data/mock';
import { tripStats } from '@/src/lib/achievements';
import type { Friend } from '@/src/types/models';
import { useChallenges } from '@/src/hooks/useChallenges';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFeed, useToggleLike } from '@/src/hooks/useFeed';
import { useFriends } from '@/src/hooks/useFriends';
import { showError } from '@/src/lib/alerts';
import { realChallengeToChallenge } from '@/src/lib/challenge-db';
import { profileColor } from '@/src/lib/profile-db';
import { startTracking, stopTracking } from '@/src/lib/tracking';
import { useAuth } from '@/src/store/auth';
import { useSession } from '@/src/store/session';
import { useTrips } from '@/src/store/trips';
import { colors, radius, spacing } from '@/src/theme';

const quickActions = [
  { label: 'Party', icon: 'radio-outline' as const, href: '/party' },
  { label: 'Eventos', icon: 'calendar-outline' as const, href: '/events' },
  { label: 'Retos', icon: 'flag-outline' as const, href: '/challenges' },
  { label: 'Rutas', icon: 'map-outline' as const, href: '/rutas' },
  { label: 'Récords', icon: 'trophy-outline' as const, href: '/records' },
  { label: 'Repostaje', icon: 'water-outline' as const, href: '/fuel' },
  { label: 'Mi QR', icon: 'qr-code-outline' as const, href: '/scan' },
  { label: 'Garaje', icon: 'car-sport-outline' as const, href: '/garage' },
  { label: 'Conducir', icon: 'navigate-outline' as const, href: '/drive' },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function ActividadScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const { posts, isDemo: feedIsDemo, isLoading: feedLoading, isError: feedError, refetch: refetchFeed } = useFeed();
  const toggleLike = useToggleLike();
  const trackingEnabled = useSession((state) => state.trackingEnabled);
  const setTrackingEnabled = useSession((state) => state.setTrackingEnabled);
  const firstName = me.name.split(' ')[0];
  const isDemo = useAuth((state) => state.account?.mode === 'demo');
  const tripTotals = useTrips((state) => state.totals);
  const stats = isDemo ? me.stats : tripStats(tripTotals);
  // Fuera del modo demo, el banner y los amigos salen de la cuenta real.
  const { active: realActive, isDemo: challengesDemo } = useChallenges();
  const bannerChallenge = challengesDemo
    ? activeChallenge
    : realActive
      ? realChallengeToChallenge(realActive)
      : null;
  const bannerLeader = bannerChallenge
    ? [...bannerChallenge.participants].sort((a, b) => b.progress - a.progress)[0]
    : null;
  const { friends: friendEntries, isDemo: friendsDemo } = useFriends();
  const roadFriends: Friend[] = friendsDemo
    ? demoFriends
    : friendEntries.map((entry) => ({
        id: entry.profile.id,
        name: entry.profile.displayName,
        username: entry.profile.username,
        color: profileColor(entry.profile.username),
        car: `@${entry.profile.username}`,
        vehicleKind: 'car',
        online: false,
        status: entry.profile.city || 'Amigo',
      }));

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const toggleTracking = async (next: boolean) => {
    if (Platform.OS === 'web') {
      setTrackingEnabled(next);
      Alert.alert(
        next ? 'Tracking activado' : 'Tracking en pausa',
        'En la web es una simulación. En el móvil se usa el GPS en segundo plano con tu permiso.',
      );
      return;
    }
    try {
      if (next) await startTracking();
      else await stopTracking();
      setTrackingEnabled(next);
    } catch (error) {
      showError('No se pudo cambiar el tracking', error, 'Revisa los permisos de ubicación.');
    }
  };

  const openTrackingOptions = () => {
    Alert.alert(
      'Tracking automático',
      trackingEnabled
        ? 'Caravana detecta tus viajes y los guarda en tu perfil. Puedes pausarlo cuando quieras.'
        : 'El tracking está en pausa. Actívalo para registrar tus rutas automáticamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: trackingEnabled ? 'Pausar' : 'Activar',
          onPress: () => toggleTracking(!trackingEnabled),
        },
        {
          text: 'Ajustes',
          onPress: () => router.push('/(tabs)/profile'),
        },
      ],
    );
  };

  return (
    <Screen contentStyle={{ paddingTop: spacing.sm }}>
      <View style={styles.backRow}>
        <IconButton icon="chevron-back" size={40} onPress={goBack} />
        <IconButton icon="notifications-outline" size={40} badge />
      </View>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="body" color={colors.muted}>
            {greeting()}
          </AppText>
          <AppText variant="h1" style={{ marginTop: 2 }}>
            {firstName}
          </AppText>
        </View>
        <Avatar name={me.name} color={me.color} size={48} uri={me.avatarUrl} />
      </View>

      <View style={styles.hero}>
        <View style={styles.heroValueRow}>
          <AppText variant="display" style={{ fontSize: 44, lineHeight: 48 }}>
            {Math.round(stats.km).toLocaleString('es-DO')}
          </AppText>
          <AppText variant="h3" color={colors.muted} style={{ marginBottom: 6, marginLeft: 6 }}>
            km
          </AppText>
        </View>
        <AppText variant="body" color={colors.muted}>
          {stats.drives} {stats.drives === 1 ? 'ruta' : 'rutas'} · {stats.hours} h al volante
        </AppText>

        <Pressable style={styles.trackingRow} onPress={openTrackingOptions}>
          <View style={[styles.liveDot, !trackingEnabled && styles.liveDotPaused]} />
          <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
            {trackingEnabled ? 'Tracking automático activo' : 'Tracking automático en pausa'}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.dim} />
        </Pressable>

        <View style={styles.heroActions}>
          <Button
            label="Salir en party"
            size="sm"
            full={false}
            style={{ flex: 1 }}
            onPress={() => router.push('/(tabs)/party')}
          />
          <Button
            label="Repostar"
            variant="secondary"
            size="sm"
            full={false}
            style={{ flex: 1 }}
            onPress={() => router.push('/(tabs)/fuel')}
          />
        </View>
      </View>

      <View style={styles.quickGrid}>
        {quickActions.map((action) => (
          <Pressable
            key={action.label}
            style={({ pressed }) => [styles.quickItem, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(action.href as never)}
          >
            <View style={styles.quickIcon}>
              <Ionicons name={action.icon} size={21} color={colors.text} />
            </View>
            <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
              {action.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      {bannerChallenge ? (
        <Pressable
          style={({ pressed }) => [styles.challengeBanner, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(tabs)/challenges')}
        >
          <View style={styles.challengeIcon}>
            <Ionicons name="flag-outline" size={20} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="caption" color={colors.muted}>
              {bannerChallenge.status === 'live' ? 'Reto en curso' : 'Reto pendiente'} ·{' '}
              {bannerChallenge.participants.length} participantes
            </AppText>
            <AppText variant="bodyStrong" style={{ marginTop: 2 }}>
              {bannerChallenge.title}
            </AppText>
            <AppText variant="caption" color={colors.muted} style={{ marginTop: 1 }}>
              {bannerChallenge.fromLabel} → {bannerChallenge.toLabel} ·{' '}
              {bannerLeader ? `${bannerLeader.isMe ? 'Tú' : bannerLeader.name.split(' ')[0]} lidera` : ''}
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.dim} />
        </Pressable>
      ) : null}

      <SectionHeader title="En la carretera" action="Ver party" onAction={() => router.push('/(tabs)/party')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: spacing.xl }}
      >
        {roadFriends.length === 0 ? (
          <Pressable onPress={() => router.push('/friends')} style={styles.friendCard}>
            <Ionicons name="person-add-outline" size={22} color={colors.textSoft} />
            <AppText variant="bodyStrong" style={{ marginTop: 10 }}>Añade amigos</AppText>
            <AppText variant="caption" color={colors.muted}>Verás aquí a tu gente.</AppText>
          </Pressable>
        ) : null}
        {roadFriends.map((friend) => (
          <Pressable
            key={friend.id}
            onPress={() => router.push('/(tabs)/party')}
            style={({ pressed }) => [styles.friendCard, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.friendTop}>
              <Avatar name={friend.name} color={friend.color} size={42} online={friend.online} />
              {friend.online ? (
                <View style={styles.friendLive}>
                  <View style={styles.friendLiveDot} />
                  <AppText variant="label" color={colors.green} style={{ fontSize: 8 }}>
                    LIVE
                  </AppText>
                </View>
              ) : null}
            </View>
            <AppText variant="bodyStrong" numberOfLines={1} style={{ marginTop: 10 }}>
              {friend.name.split(' ')[0]}
            </AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>
              {friend.car}
            </AppText>
            <View style={styles.friendBottom}>
              <Ionicons name="navigate-outline" size={11} color={colors.muted} />
              <AppText variant="caption" color={colors.muted}>
                {friend.distanceKm ? `${friend.distanceKm} km` : friend.status}
              </AppText>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <SectionHeader
        title="Actividad"
        action="Publicar"
        onAction={() => router.push('/post/new')}
      />
      {feedIsDemo ? (
        feed.map((item) => <FeedCard key={item.id} item={item} />)
      ) : feedLoading ? (
        <View style={styles.feedState}>
          <ActivityIndicator color={colors.textSoft} />
          <AppText variant="caption" color={colors.muted}>Cargando actividad…</AppText>
        </View>
      ) : feedError ? (
        <Card style={styles.feedEmpty}>
          <AppText variant="bodyStrong">No pudimos cargar el feed</AppText>
          <AppText variant="caption" color={colors.muted}>
            Revisa tu conexión y vuelve a intentarlo.
          </AppText>
          <Button
            label="Reintentar"
            variant="secondary"
            onPress={() => refetchFeed()}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      ) : posts.length === 0 ? (
        <Card style={styles.feedEmpty}>
          <View style={styles.feedEmptyIcon}>
            <Ionicons name="sparkles-outline" size={24} color={colors.textSoft} />
          </View>
          <AppText variant="title" align="center">Sé el primero en compartir</AppText>
          <AppText variant="caption" color={colors.muted} align="center">
            Publica una ruta, una foto o una idea para arrancar tu caravana.
          </AppText>
          <Button
            label="Crear publicación"
            onPress={() => router.push('/post/new')}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : (
        posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            liking={toggleLike.isPending}
            onPressComment={() => router.push(`/post/${post.id}` as Href)}
            onToggleLike={() =>
              void toggleLike.mutateAsync({
                postId: post.id,
                liked: post.likedByMe,
              })
            }
          />
        ))
      )}

      <View style={styles.footer}>
        <Ionicons name="shield-checkmark" size={13} color={colors.dim} />
        <AppText variant="caption" color={colors.dim}>
          Tu ubicación solo se comparte dentro de una party.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  liveDotPaused: { backgroundColor: colors.dim },
  hero: {
    marginTop: spacing.xl,
    borderRadius: radius['2xl'],
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  heroValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  // Cinco accesos por fila: nueve en una sola fila se montaban en móvil.
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xl,
    rowGap: spacing.md,
  },
  quickItem: { width: '20%', alignItems: 'center', gap: 6 },
  challengeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  challengeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendCard: {
    width: 132,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  friendTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  friendLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(46,230,168,0.1)',
  },
  friendLiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  friendBottom: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  feedState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing['2xl'],
  },
  feedEmpty: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    marginBottom: spacing.md,
  },
  feedEmptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
});
