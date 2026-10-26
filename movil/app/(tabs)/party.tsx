import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PartyLobby } from '@/src/components/PartyLobby';
import { PTTButton } from '@/src/components/PTTButton';
import { WorldMap } from '@/src/components/WorldMap';
import { AppText, Avatar, Button, IconButton, Pill, Screen } from '@/src/components/ui';
import { activeParty, partyMembers } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useActiveParty, useLeaveParty, usePartyLocation } from '@/src/hooks/useParty';
import { useGraphHopperRoute } from '@/src/hooks/useGraphHopperRoute';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import { formatClock } from '@/src/lib/format';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import { partyUrl } from '@/src/lib/qr';
import { colors, radius, spacing } from '@/src/theme';

type DisplayMember = {
  id: string;
  name: string;
  username: string;
  color: string;
  battery?: number;
  isTalking: boolean;
  isMe?: boolean;
  lastSeenAt?: string | null;
};

export default function PartyScreen() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const insets = useSafeAreaInsets();
  const live = useLiveLocation();
  const { party, isDemo, isLoading: partyLoading, isError: partyError, refetch } = useActiveParty();
  const leaveParty = useLeaveParty();
  const [talking, setTalking] = useState(false);
  const [elapsed, setElapsed] = useState(activeParty.elapsedSeconds);
  const [now, setNow] = useState(() => Date.now());
  const [recenterToken, setRecenterToken] = useState(0);

  usePartyLocation(
    party?.id,
    live.location,
    Boolean(party) && !isDemo && live.isLive,
  );

  useEffect(() => {
    if (isDemo) {
      const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [isDemo]);

  useEffect(() => {
    if (isDemo || !party?.id) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isDemo, party?.id]);

  const displayMembers = useMemo<DisplayMember[]>(() => {
    if (isDemo) {
      return partyMembers.map((member) => ({
        ...member,
        isTalking: member.isTalking ?? false,
        isMe: member.username === currentUser.username,
      }));
    }
    return (party?.members ?? []).map((member) => ({
      id: member.userId,
      name: member.profile.displayName,
      username: member.profile.username,
      color: member.color,
      isTalking: false,
      isMe: member.isMe,
      lastSeenAt: member.lastSeenAt,
    }));
  }, [currentUser.username, isDemo, party]);

  const mapMembers = useMemo(
    () =>
      isDemo
        ? partyMembers
            .filter((member) => member.username !== currentUser.username)
            .map((member) => ({
              id: member.id,
              name: member.name,
              color: member.color,
              latitude: member.latitude,
              longitude: member.longitude,
              isTalking: member.isTalking,
              battery: member.battery,
            }))
        : (party?.members ?? [])
            .filter(
              (member) =>
                !member.isMe && member.lastLat != null && member.lastLng != null,
            )
            .map((member) => ({
              id: member.userId,
              name: member.profile.displayName,
              color: member.color,
              latitude: member.lastLat as number,
              longitude: member.lastLng as number,
              isTalking: false,
            })),
    [currentUser.username, isDemo, party],
  );

  const destination = useMemo(() => {
    if (isDemo) {
      return {
        latitude: activeParty.destinationLatitude,
        longitude: activeParty.destinationLongitude,
        label: activeParty.destination.split(',')[0],
      };
    }
    if (party?.destinationLat != null && party.destinationLng != null) {
      return {
        latitude: party.destinationLat,
        longitude: party.destinationLng,
        label: party.destinationLabel ?? 'Destino',
      };
    }
    return null;
  }, [isDemo, party]);

  const graphHopper = useGraphHopperRoute({
    origin: live.location,
    destination:
      destination ?? {
        latitude: live.location.latitude,
        longitude: live.location.longitude,
        label: 'Sin destino',
      },
    enabled: Boolean(destination),
  });
  const routeDistance = graphHopper.route
    ? formatRouteDistance(graphHopper.route.distanceM)
    : destination
      ? 'Calculando…'
      : '—';
  const routeDuration = graphHopper.route
    ? formatRouteTime(graphHopper.route.timeMs)
    : '—';
  const displayElapsed = isDemo
    ? elapsed
    : party?.startsAt
      ? Math.max(0, Math.floor((now - Date.parse(party.startsAt)) / 1000))
      : 0;
  const partyName = isDemo ? activeParty.name : party?.name ?? 'Party';
  const partyCode = isDemo ? activeParty.code : party?.code ?? '';
  const partyDestination = isDemo
    ? activeParty.destination
    : party?.destinationLabel ?? 'Destino por definir';
  const memberCount = displayMembers.length;

  const shareParty = () =>
    Share.share({
      message: `Únete a mi party en Caravana: ${partyUrl(partyCode)}`,
      url: partyUrl(partyCode),
    });

  const leave = async () => {
    if (isDemo) {
      router.replace('/(tabs)');
      return;
    }
    if (!party) return;
    const perform = async () => {
      try {
        await leaveParty.mutateAsync({ partyId: party.id, isHost: party.isHost });
        router.replace('/(tabs)');
      } catch (error) {
        Alert.alert(
          'No pudimos salir',
          error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        );
      }
    };

    if (Platform.OS === 'web') {
      await perform();
      return;
    }

    Alert.alert(
      party.isHost ? 'Terminar party' : 'Salir de la party',
      party.isHost
        ? 'Como anfitrión, terminarás la caravana para todos.'
        : 'Dejarás de compartir tu ubicación y el chat.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: party.isHost ? 'Terminar' : 'Salir', style: 'destructive', onPress: () => void perform() },
      ],
    );
  };

  if (!isDemo && partyLoading) {
    return (
      <Screen>
        <View style={styles.state}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant="caption" color={colors.muted}>Cargando party…</AppText>
        </View>
      </Screen>
    );
  }

  if (!isDemo && partyError) {
    return (
      <Screen>
        <View style={styles.state}>
          <Ionicons name="radio-outline" size={32} color={colors.dim} />
          <AppText variant="h2" align="center">No pudimos cargar la party</AppText>
          <AppText variant="caption" color={colors.muted} align="center">
            Revisa tu conexión y vuelve a intentarlo.
          </AppText>
          <Button
            label="Reintentar"
            variant="secondary"
            onPress={() => void refetch()}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </Screen>
    );
  }

  if (!isDemo && !party) {
    return <PartyLobby />;
  }

  const startTalking = () => {
    setTalking(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const stopTalking = () => {
    setTalking(false);
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <View style={styles.container}>
      <WorldMap
        members={mapMembers}
        destination={destination}
        location={live.location}
        route={graphHopper.route}
        recenterToken={recenterToken}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <IconButton icon="chevron-down" size={40} onPress={() => router.replace('/(tabs)')} />
          <Pill label="Party en vivo" tone="danger" icon="radio" />
          <View style={styles.topActions}>
            <IconButton
              icon="locate"
              size={40}
              onPress={() => setRecenterToken((value) => value + 1)}
            />
            <IconButton
              icon="ellipsis-horizontal"
              size={40}
              onPress={() => void shareParty()}
            />
          </View>
        </View>

        <View style={styles.titleBlock}>
          <AppText variant="h2">{partyName}</AppText>
          <View style={styles.destinationRow}>
            <Ionicons name="location" size={13} color={colors.accent} />
            <AppText variant="caption" color={colors.textSoft}>
              {partyDestination} · ETA {routeDuration}
            </AppText>
          </View>
          <View style={styles.gpsRow}>
            <View
              style={[
                styles.gpsDot,
                { backgroundColor: live.isLive ? colors.lime : colors.accent },
              ]}
            />
            <AppText
              variant="caption"
              color={colors.textSoft}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {live.message}
            </AppText>
            {live.status === 'denied' || live.status === 'error' || live.status === 'demo' ? (
              <Pressable onPress={live.retry} hitSlop={8}>
                <AppText variant="label" color={colors.lime} style={{ fontSize: 9 }}>
                  REINTENTAR
                </AppText>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.routeEngineRow}>
            <Ionicons
              name={graphHopper.source === 'graphhopper' ? 'git-network-outline' : 'git-branch-outline'}
              size={13}
              color={graphHopper.source === 'graphhopper' ? colors.lime : colors.muted}
            />
            <AppText
              variant="caption"
              color={graphHopper.error ? colors.accent : colors.muted}
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {!destination
                ? 'Sin destino · comparte solo la caravana en vivo'
                : graphHopper.isLoading
                  ? 'Calculando ruta con GraphHopper…'
                  : graphHopper.error
                    ? 'GraphHopper no disponible · ruta directa'
                    : graphHopper.source === 'graphhopper'
                      ? `GraphHopper · ${routeDistance} · ${routeDuration}`
                      : 'Ruta directa · configura GraphHopper'}
            </AppText>
          </View>
        </View>
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.handle} />

        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <AppText variant="label" color={colors.muted}>
              Caravana en curso
            </AppText>
            <View style={styles.metaRow}>
              <AppText variant="mono" color={colors.text} style={{ fontSize: 17 }}>
                {formatClock(displayElapsed)}
              </AppText>
              <View style={styles.metaDot} />
              <AppText variant="caption" color={colors.textSoft}>
                {routeDistance}
              </AppText>
              <View style={styles.metaDot} />
              <AppText variant="caption" color={colors.textSoft}>
                {memberCount} {memberCount === 1 ? 'piloto' : 'pilotos'}
              </AppText>
            </View>
          </View>
          <Pressable
            style={styles.inviteButton}
            onPress={() => void shareParty()}
          >
            <Ionicons name="person-add" size={15} color={colors.accent} />
            <AppText variant="label" color={colors.accent}>Invitar</AppText>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.memberRow}
        >
          {displayMembers.map((member) => (
            <View key={member.id} style={styles.member}>
              <Avatar
                name={member.name}
                color={member.color}
                size={38}
                online
                ring={member.isTalking ? colors.accent : colors.border}
              />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
                  {member.isMe ? 'Tú' : member.name.split(' ')[0]}
                </AppText>
                <AppText variant="label" color={member.isTalking ? colors.accent : colors.dim} style={{ fontSize: 8 }}>
                  {member.isTalking
                    ? 'HABLANDO'
                    : member.battery != null
                      ? `${member.battery}%`
                      : 'EN VIVO'}
                </AppText>
              </View>
            </View>
          ))}
          <Pressable style={styles.addMember} onPress={() => void shareParty()}>
            <Ionicons name="add" size={20} color={colors.muted} />
          </Pressable>
        </ScrollView>

        <View style={styles.routeCard}>
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: colors.lime }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.muted}>Salida</AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>Tu ubicación en vivo</AppText>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={14} color={colors.dim} />
          <View style={styles.routePoint}>
            <View style={[styles.routeDot, { backgroundColor: colors.accent }]} />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.muted}>Destino</AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>{partyDestination}</AppText>
            </View>
          </View>
        </View>

        <PTTButton
          talking={talking}
          onPressIn={startTalking}
          onPressOut={stopTalking}
        />

        <View style={styles.bottomActions}>
          <Pressable style={styles.bottomAction} onPress={() => router.push('/party/chat')}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text} />
            <AppText variant="caption" color={colors.textSoft}>Chat</AppText>
            <View style={styles.unread} />
          </Pressable>
          <Pressable
            style={styles.bottomAction}
            onPress={() => void shareParty()}
          >
            <Ionicons name="share-social-outline" size={20} color={colors.text} />
            <AppText variant="caption" color={colors.textSoft}>Compartir</AppText>
          </Pressable>
          <Pressable style={styles.bottomAction} onPress={() => router.push('/(tabs)/challenges')}>
            <Ionicons name="flag-outline" size={19} color={colors.lime} />
            <AppText variant="caption" color={colors.lime}>Retar</AppText>
          </Pressable>
          <Pressable style={styles.leaveAction} onPress={() => void leave()}>
            <Ionicons name="exit-outline" size={18} color={colors.danger} />
            <AppText variant="caption" color={colors.danger}>Salir</AppText>
          </Pressable>
        </View>

        <Pressable
          onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}
          style={styles.attribution}
        >
          <AppText variant="caption" color={colors.dim} style={{ fontSize: 9 }}>
            © OpenStreetMap contributors
          </AppText>
        </Pressable>
      </View>

      <LinearGradient
        colors={['rgba(6,8,11,0.7)', 'transparent']}
        style={styles.topFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing['3xl'],
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleBlock: { marginTop: spacing.lg },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(6,8,11,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  routeEngineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingLeft: 2,
  },
  attribution: {
    alignSelf: 'flex-end',
    marginTop: 6,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.28)',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  memberRow: { gap: 8, paddingVertical: spacing.md, paddingRight: spacing.lg },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 5,
    minWidth: 118,
  },
  addMember: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  routePoint: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  bottomAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unread: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginLeft: -3,
  },
  leaveAction: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
});
