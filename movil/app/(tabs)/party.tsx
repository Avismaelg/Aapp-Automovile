import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapAttribution } from '@/src/components/MapAttribution';
import { PartyLobby } from '@/src/components/PartyLobby';
import { InviteSheet } from '@/src/components/party/InviteSheet';
import { PTTButton } from '@/src/components/PTTButton';
import { ElapsedClock } from '@/src/components/party/ElapsedClock';
import { PartyMembersRow, type DisplayMember } from '@/src/components/party/PartyMembersRow';
import { PartyTitle } from '@/src/components/party/PartyTitle';
import { PartyVoicePanel } from '@/src/components/party/PartyVoicePanel';
import { WorldMap } from '@/src/components/WorldMap';
import { AppText, Button, IconButton, Pill, Screen } from '@/src/components/ui';
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
import { useSimulator } from '@/src/lib/simulator';
import { useFollow } from '@/src/store/follow';
import { formatRouteDistance, formatRouteTime } from '@/src/lib/graphhopper';
import {
  partyVoiceChannels,
  type PartyVoiceChannelSlug,
} from '@/src/lib/party';
import { colors, radius, spacing } from '@/src/theme';
import { t } from '@/src/i18n';

export default function PartyScreen() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const insets = useSafeAreaInsets();
  const live = useLiveLocation();
  const { party, isDemo: demoAccount, isLoading: partyLoading, isError: partyError, refetch } = useActiveParty();
  // Party simulada (Perfil › Simulador): sin party real se muestra como la demo
  // pero con los amigos simulados moviéndose en convoy.
  const simMembers = useSimulator((state) => state.members);
  const simParty = useSimulator((state) => state.party) && !party;
  const isDemo = demoAccount || simParty;
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
  // En demo el convoy "empezó" hace activeParty.elapsedSeconds.
  const [demoStartedAt] = useState(() => Date.now() - activeParty.elapsedSeconds * 1000);
  const [recenterToken, setRecenterToken] = useState(0);
  const [inviteOpen, setInviteOpen] = useState(false);

  const displayMembers = useMemo<DisplayMember[]>(() => {
    // Prueba de carga del simulador: la party enorme.
    if (simParty && simMembers.length > partyMembers.length) {
      return simMembers.map((member) => ({
        id: member.id,
        name: member.name,
        username: member.id,
        color: member.color,
        isTalking: member.isTalking,
      }));
    }
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
      speedKmh: member.speedKmh,
      voiceChannelSlug: member.voiceChannelSlug,
    }));
  }, [
    currentUser.username,
    isDemo,
    simParty,
    simMembers,
    party,
    voice.activeSpeakerIds,
    voice.talking,
  ]);

  const mapMembers = useMemo(
    () =>
      simParty
        ? simMembers
        : isDemo
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
    [currentUser.username, isDemo, party, simParty, simMembers],
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
        label: party.destinationLabel ?? t('Destino'),
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
        label: t('Sin destino'),
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
  const elapsedSince = isDemo
    ? demoStartedAt
    : party?.startsAt
      ? Date.parse(party.startsAt)
      : null;
  const routeStatus = !destination
    ? t('Sin destino · comparte solo la caravana en vivo')
    : graphHopper.isLoading
      ? t('Calculando ruta por calles…')
      : graphHopper.error
        ? t('No encontramos una calle transitable')
        : graphHopper.source === 'graphhopper'
          ? t('GraphHopper · {0} · {1}', routeDistance, routeDuration)
          : graphHopper.source === 'osrm'
            ? t('Calles OSM · {0} · {1}', routeDistance, routeDuration)
            : t('Sin ruta por calles');
  const partyName = isDemo ? activeParty.name : party?.name ?? t('Party');
  const partyCode = isDemo ? activeParty.code : party?.code ?? '';
  const partyDestination = isDemo
    ? activeParty.destination
    : party?.destinationLabel ?? t('Destino por definir');
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
      showError(t('No pudimos cambiar de canal'), error);
    }
  };

  const openInvite = () => {
    if (isDemo && !simParty) {
      Alert.alert(t('Invitar'), t('Las invitaciones reales requieren una cuenta conectada.'));
      return;
    }
    setInviteOpen(true);
  };

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
      Alert.alert(t('Retos'), t('Los retos reales requieren una cuenta conectada.'));
      return;
    }
    const invitees = pilots
      .filter((member) => !member.isMe)
      .map((member) => ({ userId: member.id, vehicleKind: 'car' as const }));
    if (invitees.length === 0) {
      Alert.alert(t('Retos'), t('Todavía no hay pilotos a quienes retar.'));
      return;
    }
    if (!destination) {
      Alert.alert(
        t('Elige la meta'),
        t('Fija primero el destino del convoy (búscalo en el mapa y pulsa Ir): gana quien llegue primero ahí.'),
      );
      return;
    }
    Alert.alert(
      title,
      t('Reto por llegada: gana quien llegue primero a la meta del convoy, respetando las leyes.'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        {
          text: t('Reto'),
          style: 'destructive',
          onPress: () => {
            void createChallenge
              .mutateAsync({
                title: title.replace('Reto a ', 'Reto: '),
                category: 'mixed',
                mode: 'instant',
                fromLabel: t('Salida del convoy'),
                toLabel: destination.label,
                endLat: destination.latitude,
                endLng: destination.longitude,
                distanceKm: (graphHopper.route?.distanceM ?? 0) / 1000,
                rules: t('Por llegada: gana quien llegue primero respetando las leyes.'),
                hostVehicleId: primaryVehicle?.id,
                hostVehicleKind: primaryVehicle?.kind ?? 'car',
                invitees,
              })
              .then(() => Alert.alert(t('Reto enviado'), t('Verás la respuesta en la pestaña Retos.')))
              .catch((error: unknown) =>
                showError(t('Reto'), error, t('No pudimos crear el reto.')),
              );
          },
        },
      ],
    );
  };

  // Tocar a un piloto: seguirle (la ruta va a donde está y se mueve con él)
  // o retarle.
  const memberActions = (member: DisplayMember) => {
    const first = member.name.split(' ')[0];
    Alert.alert(member.name, undefined, [
      {
        text: t('Seguir a {0}', first),
        onPress: () => {
          const real = party?.members.find((item) => item.userId === member.id);
          if (real && (real.lastLat == null || real.lastLng == null)) {
            Alert.alert(
              t('{0} no comparte su ubicación ahora', first),
              t('Cuando abra la app y se mueva, podrás seguirle.'),
            );
            return;
          }
          useFollow.getState().follow({ id: member.id, name: member.name });
          router.replace('/');
        },
      },
      { text: t('Retar a {0}', first), onPress: () => challengePilots(t('Reto a {0}', first), [member]) },
      { text: t('Cancelar'), style: 'cancel' },
    ]);
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
        showError(t('No pudimos salir'), error);
      }
    };

    if (Platform.OS === 'web') {
      await perform();
      return;
    }

    Alert.alert(
      party.isHost ? t('Terminar party') : t('Salir de la party'),
      party.isHost
        ? t('Como anfitrión, terminarás la caravana para todos.')
        : t('Dejarás de compartir tu ubicación y el chat.'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { text: party.isHost ? t('Terminar') : t('Salir'), style: 'destructive', onPress: () => void perform() },
      ],
    );
  };

  if (!isDemo && partyLoading) {
    return (
      <Screen>
        <View style={styles.state}>
          <ActivityIndicator color={colors.textSoft} />
          <AppText variant="caption" color={colors.muted}>{t('Cargando party…')}</AppText>
        </View>
      </Screen>
    );
  }

  if (!isDemo && partyError) {
    return (
      <Screen>
        <View style={styles.state}>
          <Ionicons name="radio-outline" size={32} color={colors.dim} />
          <AppText variant="h2" align="center">{t('No pudimos cargar la party')}</AppText>
          <AppText variant="caption" color={colors.muted} align="center">
            {t('Revisa tu conexión y vuelve a intentarlo.')}
          </AppText>
          <Button
            label={t('Reintentar')}
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
          t('Voz no disponible'),
          voice.error ??
            t('La voz todavía se está conectando. Espera un momento e inténtalo de nuevo.'),
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
          <Pill label={t('Party en vivo')} tone="danger" icon="radio" />
          <View style={styles.topActions}>
            <IconButton
              icon="locate"
              size={40}
              onPress={() => setRecenterToken((value) => value + 1)}
            />
            <IconButton
              icon="ellipsis-horizontal"
              size={40}
              onPress={openInvite}
            />
          </View>
        </View>

        <PartyTitle
          name={partyName}
          destination={partyDestination}
          duration={routeDuration}
          routeStatus={routeStatus}
          streetRouting={graphHopper.source === 'graphhopper'}
          routeError={Boolean(graphHopper.error)}
          live={live}
        />
      </View>

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.handle} />

        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <AppText variant="title">{t('Caravana en curso')}</AppText>
            <View style={styles.metaRow}>
              <ElapsedClock since={elapsedSince} />
              <View style={styles.metaDot} />
              <AppText variant="caption" color={colors.textSoft}>
                {routeDistance}
              </AppText>
              <View style={styles.metaDot} />
              <AppText variant="caption" color={colors.textSoft}>
                {memberCount} {memberCount === 1 ? 'piloto' : 'pilotos'}
              </AppText>
              {partyCode ? (
                <>
                  <View style={styles.metaDot} />
                  <Pressable onPress={openInvite} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('Código {0}', partyCode)}>
                    <AppText variant="caption" color={colors.text} style={styles.codeText}>
                      {partyCode}
                    </AppText>
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
          <Pressable
            style={styles.inviteButton}
            onPress={openInvite}
          >
            <Ionicons name="person-add-outline" size={15} color={colors.text} />
            <AppText variant="bodyStrong" style={{ fontSize: 13 }}>{t('Invitar')}</AppText>
          </Pressable>
        </View>

        <PartyMembersRow
          members={displayMembers}
          onChallenge={memberActions}
          onInvite={openInvite}
        />

        <Button
          label={t('Ver el convoy en el mapa')}
          variant="secondary"
          size="sm"
          icon="navigate-outline"
          onPress={openConvoyMap}
        />

        <PartyVoicePanel
          isDemo={isDemo}
          voice={voice}
          current={voiceChannel}
          channelCount={channelCount}
          onSelect={(slug) => void switchChannel(slug)}
        />

        <PTTButton
          talking={isTalkingNow}
          onPressIn={() => void startTalking()}
          onPressOut={() => void stopTalking()}
        />

        <View style={styles.bottomActions}>
          <Pressable style={styles.bottomAction} onPress={() => router.push('/party/chat')}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.text} />
            <AppText variant="caption" color={colors.textSoft}>{t('Chat')}</AppText>
          </Pressable>
          <Pressable
            style={styles.bottomAction}
            onPress={openInvite}
          >
            <Ionicons name="qr-code-outline" size={19} color={colors.text} />
            <AppText variant="caption" color={colors.textSoft}>{t('Código')}</AppText>
          </Pressable>
          <Pressable
            style={styles.bottomAction}
            onPress={() => challengePilots(t('Reto al convoy: {0}', partyName), displayMembers)}
          >
            <Ionicons name="flag-outline" size={19} color={colors.text} />
            <AppText variant="caption" color={colors.textSoft}>{t('Retar')}</AppText>
          </Pressable>
          <Pressable style={styles.leaveAction} onPress={() => void leave()}>
            <Ionicons name="exit-outline" size={18} color={colors.danger} />
            <AppText variant="caption" color={colors.danger}>{t('Salir')}</AppText>
          </Pressable>
        </View>

        <MapAttribution style={styles.attribution} />
      </View>

      <InviteSheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        simulated={simParty}
        extraFriends={
          simParty
            ? [
                { id: 'sim-ana', name: 'Ana Ruiz', username: 'ana.ruiz' },
                { id: 'sim-pedro', name: 'Pedro Gil', username: 'pedrogil' },
                { id: 'sim-marta', name: 'Marta Sanz', username: 'martasanz' },
              ]
            : []
        }
        party={
          simParty
            ? {
                id: 'sim',
                code: partyCode,
                name: partyName,
                memberIds: displayMembers.map((member) => member.id),
              }
            : party
            ? {
                id: party.id,
                code: party.code,
                name: party.name,
                memberIds: party.members.map((member) => member.userId),
              }
            : null
        }
      />

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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHigh,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 3 },
  codeText: { fontWeight: '700', letterSpacing: 1.5 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.sm,
  },
  bottomAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leaveAction: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
  },
});
