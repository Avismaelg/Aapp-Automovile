import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import Svg, { Path } from 'react-native-svg';

import { FeedCard } from '@/src/components/FeedCard';
import { PostCard } from '@/src/components/PostCard';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Pill,
  Screen,
  SectionHeader,
  Stat,
} from '@/src/components/ui';
import { activeChallenge, feed, friends } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFeed, useToggleLike } from '@/src/hooks/useFeed';
import { startTracking, stopTracking } from '@/src/lib/tracking';
import { useSession } from '@/src/store/session';
import { colors, radius, spacing } from '@/src/theme';

const quickActions = [
  { label: 'Party', icon: 'radio' as const, color: colors.accent, href: '/party' },
  { label: 'Eventos', icon: 'calendar' as const, color: '#FF8AD4', href: '/events' },
  { label: 'Retos', icon: 'flag' as const, color: colors.lime, href: '/challenges' },
  { label: 'Rutas', icon: 'map' as const, color: '#2EE6A8', href: '/rutas' },
  { label: 'Récords', icon: 'trophy' as const, color: '#FFD24D', href: '/records' },
  { label: 'Repostaje', icon: 'water' as const, color: colors.cyan, href: '/fuel' },
  { label: 'Mi QR', icon: 'qr-code' as const, color: '#B98CFF', href: '/scan' },
  { label: 'Garaje', icon: 'car-sport' as const, color: '#FFB84D', href: '/garage' },
  { label: 'Conducir', icon: 'navigate' as const, color: colors.cyan, href: '/drive' },
];

function HeroRoute() {
  return (
    <Svg
      width={210}
      height={170}
      viewBox="0 0 210 170"
      style={styles.heroRoute}
      pointerEvents="none"
    >
      <Path
        d="M8 150 C 40 120, 52 132, 74 100 S 92 52, 122 48 S 160 70, 178 34 S 196 18, 208 8"
        stroke={colors.accent}
        strokeWidth={2}
        fill="none"
        opacity={0.35}
        strokeDasharray="4 5"
      />
      <Path
        d="M8 150 C 40 120, 52 132, 74 100 S 92 52, 122 48 S 160 70, 178 34 S 196 18, 208 8"
        stroke={colors.accent}
        strokeWidth={8}
        fill="none"
        opacity={0.07}
      />
      <Path d="M0 88 C 40 80, 66 96, 104 86 S 160 66, 210 74" stroke="#1C2631" strokeWidth={1} fill="none" />
      <Path d="M34 0 C 42 54, 28 104, 44 170" stroke="#1C2631" strokeWidth={1} fill="none" />
      <Path d="M140 0 C 132 56, 150 120, 136 170" stroke="#1C2631" strokeWidth={1} fill="none" />
    </Svg>
  );
}

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
      Alert.alert(
        'No se pudo cambiar el tracking',
        error instanceof Error ? error.message : 'Revisa los permisos de ubicación.',
      );
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
        <AppText variant="label" color={colors.muted}>Actividad</AppText>
      </View>
      <View style={styles.header}>
        <View>
          <View style={styles.brandRow}>
            <View style={styles.brandDot} />
            <AppText variant="label" color={colors.accent} style={{ letterSpacing: 2 }}>
              CARAVANA
            </AppText>
          </View>
          <AppText variant="h1" style={{ marginTop: 6 }}>
            {greeting()},{'\n'}{firstName}.
          </AppText>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon="notifications-outline" badge />
          <Avatar
            name={me.name}
            color={me.color}
            size={44}
            uri={me.avatarUrl}
            ring={colors.border}
            online
          />
        </View>
      </View>

      <Pressable style={styles.trackingBar} onPress={openTrackingOptions}>
        <View style={[styles.liveDot, !trackingEnabled && styles.liveDotPaused]} />
        <AppText variant="caption" color={colors.textSoft} style={{ flex: 1 }}>
          {trackingEnabled ? 'Tracking automático activo' : 'Tracking automático en pausa'}
        </AppText>
        <Pill
          label={trackingEnabled ? 'Listo' : 'Pausa'}
          tone={trackingEnabled ? 'lime' : 'neutral'}
          icon={trackingEnabled ? 'flash' : 'pause'}
        />
      </Pressable>

      <LinearGradient
        colors={['#2A170F', '#151A21', '#10151B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <HeroRoute />
        <View style={styles.heroTop}>
          <Pill label="Tu mes en la carretera" tone="accent" icon="flag" />
          <Pill label="+12 %" tone="lime" icon="trending-up" />
        </View>
        <View style={styles.heroValueRow}>
          <AppText variant="display" style={{ fontSize: 42 }}>
            1.284
          </AppText>
          <AppText variant="h3" color={colors.textSoft} style={{ marginBottom: 8, marginLeft: 6 }}>
            km
          </AppText>
        </View>
        <AppText variant="caption" color={colors.muted}>
          128 rutas · 214 horas al volante
        </AppText>

        <View style={styles.heroStats}>
          <Stat value="128" label="rutas" />
          <View style={styles.heroDivider} />
          <Stat value="214 h" label="conduciendo" />
          <View style={styles.heroDivider} />
          <Stat value="42" label="amigos" />
        </View>

        <View style={styles.heroActions}>
          <Pressable style={styles.heroPrimary} onPress={() => router.push('/(tabs)/party')}>
            <Ionicons name="radio" size={18} color="#120802" />
            <AppText variant="bodyStrong" color="#120802">Salir en party</AppText>
          </Pressable>
          <Pressable style={styles.heroSecondary} onPress={() => router.push('/(tabs)/fuel')}>
            <Ionicons name="water-outline" size={18} color={colors.text} />
            <AppText variant="bodyStrong">Repostar</AppText>
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.quickGrid}>
        {quickActions.map((action) => (
          <Pressable
            key={action.label}
            style={({ pressed }) => [styles.quickItem, pressed && { opacity: 0.7 }]}
            onPress={() => router.push(action.href as never)}
          >
            <View style={[styles.quickIcon, { backgroundColor: `${action.color}1F`, borderColor: `${action.color}40` }]}>
              <Ionicons name={action.icon} size={21} color={action.color} />
            </View>
            <AppText variant="caption" color={colors.textSoft}>{action.label}</AppText>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.challengeBanner, pressed && { opacity: 0.85 }]}
        onPress={() => router.push('/(tabs)/challenges')}
      >
        <View style={styles.challengeIcon}>
          <Ionicons name="flag" size={20} color={colors.lime} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.lime} style={{ fontSize: 8 }}>
            RETO EN CURSO · {activeChallenge.participants.length} PARTICIPANTES
          </AppText>
          <AppText variant="bodyStrong" style={{ marginTop: 2 }}>
            {activeChallenge.title}
          </AppText>
          <AppText variant="caption" color={colors.muted} style={{ marginTop: 1 }}>
            {activeChallenge.fromLabel} → {activeChallenge.toLabel} ·{' '}
            {activeChallenge.participants[0].name.split(' ')[0]} lidera
          </AppText>
        </View>
        <View style={styles.challengeCta}>
          <AppText variant="label" color={colors.textSoft} style={{ fontSize: 9 }}>VER</AppText>
          <Ionicons name="chevron-forward" size={13} color={colors.textSoft} />
        </View>
      </Pressable>

      <SectionHeader title="En la carretera" action="Ver party" onAction={() => router.push('/(tabs)/party')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: spacing.xl }}
      >
        {friends.map((friend) => (
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
              <Ionicons name="navigate" size={11} color={colors.accent} />
              <AppText variant="caption" color={colors.accent}>
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
          <ActivityIndicator color={colors.accent} />
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
            <Ionicons name="sparkles-outline" size={24} color={colors.accent} />
          </View>
          <AppText variant="title" align="center">Sé el primero en compartir</AppText>
          <AppText variant="caption" color={colors.muted} align="center">
            Publica una ruta, una foto o una idea para arrancar tu caravana.
          </AppText>
          <Button
            label="Crear publicación"
            icon="create-outline"
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
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  trackingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  liveDotPaused: { backgroundColor: colors.dim, shadowOpacity: 0 },
  hero: {
    marginTop: spacing.lg,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.25)',
    padding: spacing.xl,
    overflow: 'hidden',
  },
  heroRoute: { position: 'absolute', right: -10, top: 20, opacity: 0.9 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  heroDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: spacing.lg },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: spacing.xl },
  heroPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    gap: 6,
  },
  quickItem: { flex: 1, alignItems: 'center', gap: 7 },
  challengeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.lg,
    backgroundColor: 'rgba(201,255,77,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.2)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  challengeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendCard: {
    width: 132,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
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
    backgroundColor: colors.accentSoft,
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
