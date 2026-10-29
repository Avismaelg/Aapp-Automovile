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
import { useActiveParty, useLeaveParty, useSetVoiceChannel } from '@/src/hooks/useParty';
import { showError } from '@/src/lib/alerts';
import { useChosenDestination } from '@/src/store/destination';
import { useCreateChallenge } from '@/src/hooks/useChallenges';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { useVoiceRoom } from '@/src/hooks/useVoiceRoom';
import { useGraphHopperRoute } from '@/src/hooks/useGraphHopperRoute';
import { useLiveLocation } from '@/src/hooks/useLiveLocation';
import { formatClock } from '@/src/lib/format';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import {
  partyVoiceChannels,
  type PartyVoiceChannelSlug,
} from '@/src/lib/party';
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
  voiceChannelSlug?: PartyVoiceChannelSlug;
};

export default function PartyScreen() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const insets = useSafeAreaInsets();
  const live = useLiveLocation();
  const { party, isDemo, isLoading: partyLoading, isError: partyError, refetch } = useActiveParty();
  const leaveParty = useLeaveParty();
  const setVoiceChannel = useSetVoiceChannel();
  const [talking, setTalking] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<PartyVoiceChannelSlug | null>(null);
  const myMember = party?.members.find((member) => member.isMe);
  const voiceChannel = selectedChannel ?? myMember?.voiceChannelSlug ?? 'convoy';
  const voice = useVoiceRoom({
    partyId: party?.id,
    channelSlug: voiceChannel,
    enabled: Boolean(party) && !isDemo,
  });
  const [elapsed, setElapsed] = useState(activeParty.elapsedSeconds);
  const [now, setNow] = useState(() => Date.now());
  const [recenterToken, setRecenterToken] = useState(0);

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
      return partyMembers.map((member, index) => ({
        ...member,
        isTalking: member.isTalking ?? false,
        isMe: member.username === currentUser.username,
        voiceChannelSlug: partyVoiceChannels[index % partyVoiceChannels.length].slug,
      }));
    }
    return (party?.members ?? []).map((member) => ({
      id: member.userId,
      name: member.profile.displayName,
      username: member.profile.username,
      color: member.color,
      isTalking: member.isMe
        ? voice.talking
        : voice.activeSpeakerIds.includes(member.userId),
      isMe: member.isMe,
      lastSeenAt: member.lastSeenAt,
      voiceChannelSlug: member.voiceChannelSlug,
    }));
  }, [
    currentUser.username,
    isDemo,
    party,
    voice.activeSpeakerIds,
    voice.talking,
  ]);

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
  const channelCount = (slug: PartyVoiceChannelSlug) =>
    displayMembers.filter((member) => member.voiceChannelSlug === slug).length;
  const isTalkingNow = isDemo ? talking : voice.talking;

  const switchChannel = async (slug: PartyVoiceChannelSlug) => {
    if (slug === voiceChannel) return;
    setSelectedChannel(slug);
    if (isDemo || !party) return;
    try {
      await setVoiceChannel.mutateAsync({ partyId: party.id, channelSlug: slug });
    } catch (error) {
      showError('No pudimos cambiar de canal', error);
    }
  };

  const shareParty = () =>
    Share.share({
      message: `Únete a mi party en Caravana: ${partyUrl(partyCode)}`,
      url: partyUrl(partyCode),
    });

  const startNavigation = useChosenDestination((state) => state.startNavigation);
  const setChosenDestination = useChosenDestination((state) => state.setDestination);
  const createChallenge = useCreateChallenge();
  const { vehicles: garageVehicles } = useGarageVehicles();
  const primaryVehicle = garageVehicles.find((item) => item.isPrimary) ?? garageVehicles[0];

  const openConvoyMap = () => {
    if (destination) {
      setChosenDestination({
        latitude: destination.latitude,
        longitude: destination.longitude,
        label: destination.label,
      });
      startNavigation();
    }
    router.replace('/');
  };

  // Reto instantáneo de llegada: nunca por velocidad máxima.
  const challengePilots = (title: string, pilots: DisplayMember[]) => {
    if (isDemo) {
      Alert.alert('Retos', 'Los retos reales requieren una cuenta conectada.');
      return;
    }
    const invitees = pilots
      .filter((member) => !member.isMe)
      .map((member) => ({ userId: member.id, vehicleKind: 'car' as const }));
    if (invitees.length === 0) {
      Alert.alert('Retos', 'Todavía no hay pilotos a quienes retar.');
      return;
    }
    Alert.alert(
      title,
      'Reto por llegada: gana quien llegue primero a la meta del convoy, respetando las leyes.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reto',
          style: 'destructive',
          onPress: () => {
            void createChallenge
              .mutateAsync({
                title: title.replace('Reto a ', 'Reto: '),
                category: 'mixed',
                mode: 'instant',
                fromLabel: 'Salida del convoy',
                toLabel: partyDestination,
                distanceKm: (graphHopper.route?.distanceM ?? 0) / 1000,
                rules: 'Por llegada: gana quien llegue primero respetando las leyes.',
                hostVehicleId: primaryVehicle?.id,
                hostVehicleKind: primaryVehicle?.kind ?? 'car',
                invitees,
              })
              .then(() => Alert.alert('Reto enviado', 'Verás la respuesta en la pestaña Retos.'))
              .catch((error: unknown) =>
                showError('Reto', error, 'No pudimos crear el reto.'),
              );
          },
        },
      ],
    );
  };

  const leave = async () => {
    if (isDemo) {
      router.replace('/');
      return;
    }
    if (!party) return;
    const perform = async () => {
      try {
        await leaveParty.mutateAsync({ partyId: party.id, isHost: party.isHost });
        router.replace('/');
      } catch (error) {
        showError('No pudimos salir', error);
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

  const startTalking = async () => {
    if (!isDemo) {
      if (voice.status !== 'connected') {
        Alert.alert(
          'Voz no disponible',
          voice.error ??
            'La voz todavía se está conectando. Espera un momento e inténtalo de nuevo.',
        );
        return;
      }
      await voice.setTalking(true);
    } else {
      setTalking(true);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const stopTalking = async () => {
    if (!isDemo) {
      await voice.setTalking(false);
    } else {
      setTalking(false);
    }
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
          <IconButton icon="chevron-down" size={40} onPress={() => router.replace('/')} />
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
                  ? 'Calculando ruta por calles…'
                  : graphHopper.error
                    ? 'No encontramos una calle transitable'
                    : graphHopper.source === 'graphhopper'
                      ? `GraphHopper · ${routeDistance} · ${routeDuration}`
                      : graphHopper.source === 'osrm'
                        ? `Calles OSM · ${routeDistance} · ${routeDuration}`
                        : 'Sin ruta por calles'}
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
            <Pressable
              key={member.id}
              onPress={() => challengePilots(`Reto a ${member.name.split(' ')[0]}`, [member])}
              disabled={member.isMe}
              style={({ pressed }) => [styles.member, pressed && { opacity: 0.75 }]}
              accessibilityRole="button"
              accessibilityLabel={`Retar a ${member.name}`}
            >
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
            </Pressable>
          ))}
          <Pressable style={styles.addMember} onPress={() => void shareParty()}>
            <Ionicons name="add" size={20} color={colors.muted} />
          </Pressable>
        </ScrollView>

        <View style={styles.convoyActions}>
          <Button
            label="Mapa del convoy"
            variant="lime"
            size="sm"
            icon="navigate"
            onPress={openConvoyMap}
            style={{ flex: 1 }}
          />
          <Button
            label="Retar al convoy"
            variant="secondary"
            size="sm"
            icon="flag"
            onPress={() => challengePilots(`Reto al convoy: ${partyName}`, displayMembers)}
            style={{ flex: 1 }}
          />
        </View>

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

        <View style={styles.voiceSection}>
          <View style={styles.voiceHeader}>
            <AppText variant="label" color={colors.muted}>CANALES DE VOZ · 3</AppText>
            <Pill
              label={
                isDemo
                  ? 'Demo'
                  : voice.status === 'connected'
                    ? `Voz ${voice.participantCount}`
                    : voice.status === 'connecting'
                      ? 'Conectando'
                      : voice.status === 'error'
                        ? 'Sin configurar'
                        : 'Inactivo'
              }
              tone={
                voice.status === 'connected'
                  ? 'lime'
                  : voice.status === 'error'
                    ? 'danger'
                    : 'neutral'
              }
              icon="mic-outline"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.channelRow}
          >
            {partyVoiceChannels.map((channel) => {
              const selected = channel.slug === voiceChannel;
              return (
                <Pressable
                  key={channel.slug}
                  onPress={() => void switchChannel(channel.slug)}
                  style={[styles.channelChip, selected && styles.channelChipActive]}
                >
                  <Ionicons
                    name={
                      channel.slug === 'convoy'
                        ? 'radio-outline'
                        : channel.slug === 'route'
                          ? 'navigate-outline'
                          : 'chatbubbles-outline'
                    }
                    size={15}
                    color={selected ? colors.accent : colors.muted}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" color={selected ? colors.text : colors.textSoft}>
                      {channel.name}
                    </AppText>
                    <AppText variant="label" color={selected ? colors.accent : colors.dim} style={{ fontSize: 8 }}>
                      {channelCount(channel.slug)} EN CANAL
                    </AppText>
                  </View>
                  {selected ? <View style={styles.channelDot} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          {voice.error && !isDemo ? (
            <AppText variant="caption" color={colors.accent} numberOfLines={2}>
              {voice.error}
            </AppText>
          ) : (
            <AppText variant="caption" color={colors.dim} numberOfLines={1}>
              {isDemo
                ? 'Voz de ejemplo en modo demo.'
                : voice.status === 'connected'
                  ? `PTT real en ${partyVoiceChannels.find((channel) => channel.slug === voiceChannel)?.name ?? 'Convoy'}.`
                  : 'Conectando el PTT de voz de la party…'}
            </AppText>
          )}
        </View>

        <PTTButton
          talking={isTalkingNow}
          onPressIn={() => void startTalking()}
          onPressOut={() => void stopTalking()}
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
  convoyActions: { flexDirection: 'row', gap: 8, marginBottom: 4 },
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
  voiceSection: {
    marginTop: spacing.sm,
    gap: 7,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  channelRow: {
    gap: 7,
    paddingRight: spacing.lg,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 116,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  channelChipActive: {
    borderColor: 'rgba(255,90,31,0.42)',
    backgroundColor: colors.accentSoft,
  },
  channelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lime,
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
