import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Pill,
  Screen,
  SectionHeader,
} from '@/src/components/ui';
import { activeChallenge, challengeRoutes, recentChallenges } from '@/src/data/mock';
import { showError } from '@/src/lib/alerts';
import type { Challenge, ChallengeCategory } from '@/src/types/models';
import {
  useChallengeFriends,
  useChallenges,
  useCreateChallenge,
  useFinishChallenge,
  useRespondChallenge,
  useStartChallenge,
} from '@/src/hooks/useChallenges';
import { ActiveChallengeCard } from '@/src/components/challenges/ActiveChallengeCard';
import { CategoryPicker } from '@/src/components/challenges/CategoryPicker';
import { ChallengeStandings } from '@/src/components/challenges/ChallengeStandings';
import { FriendPicker } from '@/src/components/challenges/FriendPicker';
import { RecentResults } from '@/src/components/challenges/RecentResults';
import { RoutePicker } from '@/src/components/challenges/RoutePicker';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import {
  emptyChallenge,
  realChallengeToChallenge,
  type ChallengeFriend,
} from '@/src/lib/challenge-db';
import { formatClock, timeAgo } from '@/src/lib/format';
import { profileColor } from '@/src/lib/profile-db';
import { challengeUrl } from '@/src/lib/qr';
import { colors, radius, spacing } from '@/src/theme';
import { vehicleCategoryLabel } from '@/src/lib/vehicles';

function challengeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function challengeCode(prefix: 'R' | 'S') {
  return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

type ChallengeMode = 'instant' | 'scheduled';

const modeOptions: { key: ChallengeMode; label: string; icon: keyof typeof Ionicons.glyphMap; detail: string }[] = [
  {
    key: 'instant',
    label: 'Al momento',
    icon: 'flash',
    detail: 'Salida inmediata con 2+ pilotos',
  },
  {
    key: 'scheduled',
    label: 'Programado',
    icon: 'calendar-outline',
    detail: 'Invita a un rival y espera',
  },
];

export default function ChallengesScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const { vehicles: garageVehicles } = useGarageVehicles();
  const {
    friends: challengeFriends,
    isLoading: friendsLoading,
  } = useChallengeFriends();
  const {
    active: realActive,
    history: realHistory,
    isDemo,
    isLoading: challengesLoading,
    isError: challengesError,
    refetch: refetchChallenges,
  } = useChallenges();
  const createChallenge = useCreateChallenge();
  const respondChallenge = useRespondChallenge();
  const startRealChallenge = useStartChallenge();
  const finishRealChallenge = useFinishChallenge();
  const [localActive, setLocalActive] = useState<Challenge>(activeChallenge);
  const [selectedRouteId, setSelectedRouteId] = useState(challengeRoutes[1].id);
  const [category, setCategory] = useState<ChallengeCategory>('mixed');
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>('instant');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [instantSelectedIds, setInstantSelectedIds] = useState<string[]>([]);
  const [matchedFriend, setMatchedFriend] = useState<ChallengeFriend | null>(null);
  const [matching, setMatching] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const route = challengeRoutes.find((item) => item.id === selectedRouteId) ?? challengeRoutes[1];
  const filteredFriends = useMemo(
    () =>
      category === 'mixed'
        ? challengeFriends
        : challengeFriends.filter((friend) => friend.vehicleKind === category),
    [category, challengeFriends],
  );
  const selectedFriend =
    filteredFriends.find((friend) => friend.id === selectedFriendId) ?? null;
  const rival = matchedFriend ?? selectedFriend;
  const selectedInstantFriends = filteredFriends.filter((friend) =>
    instantSelectedIds.includes(friend.id),
  );
  const myVehicle =
    category === 'mixed'
      ? garageVehicles[0] ?? me.car
      : garageVehicles.find((vehicle) => vehicle.kind === category) ??
        garageVehicles[0] ??
        me.car;

  const active = isDemo
    ? localActive
    : realActive
      ? realChallengeToChallenge(realActive, now)
      : emptyChallenge();
  const hasActive = isDemo || Boolean(realActive);
  const activeIsInvite = Boolean(
    !isDemo &&
      realActive &&
      !realActive.isHost &&
      realActive.myStatus === 'invited',
  );
  const activeIsHost = isDemo || Boolean(realActive?.isHost);
  const activeIsWaiting =
    Boolean(!isDemo && realActive?.status === 'pending' && !realActive.isHost) &&
    !activeIsInvite;
  const activeHostReady = isDemo
    ? true
    : Boolean(
        realActive?.isHost &&
          realActive.participants.every(
            (participant) => participant.isHost || participant.status !== 'invited',
          ),
      );
  const activeReadyToStart = isDemo
    ? true
    : Boolean(
        realActive &&
          realActive.participants.filter(
            (participant) =>
              participant.status === 'accepted' || participant.status === 'finished',
          ).length >= 2,
      );

  const standings = useMemo(
    () => [...active.participants].sort((a, b) => b.progress - a.progress),
    [active.participants],
  );

  useEffect(() => {
    if (!isDemo || localActive.status !== 'live') return;
    const timer = setInterval(() => {
      setLocalActive((previous) =>
        previous.status === 'live'
          ? { ...previous, elapsedSeconds: previous.elapsedSeconds + 1 }
          : previous,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [isDemo, localActive.status]);

  useEffect(() => {
    if (isDemo || realActive?.status !== 'live') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isDemo, realActive?.id, realActive?.status]);

  const chooseCategory = (next: ChallengeCategory) => {
    setCategory(next);
    setSelectedFriendId(null);
    setInstantSelectedIds([]);
    setMatchedFriend(null);
    setSentTo(null);
  };

  const chooseMode = (next: ChallengeMode) => {
    setChallengeMode(next);
    setSentTo(null);
  };

  const matchmake = () => {
    if (filteredFriends.length === 0) {
      Alert.alert('Sin rivales', 'No tienes amigos con ese tipo de vehículo. Prueba otra categoría.');
      return;
    }
    setMatching(true);
    setMatchedFriend(null);
    setSentTo(null);
    setTimeout(() => {
      const online = filteredFriends.filter((friend) => friend.online);
      const pool = online.length ? online : filteredFriends;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setMatchedFriend(pick);
      setSelectedFriendId(pick.id);
      setMatching(false);
    }, 1400);
  };

  const ensureRealVehicle = () => {
    if (isDemo) return true;
    if (garageVehicles.length === 0) {
      Alert.alert(
        'Añade un vehículo',
        'Para crear un reto real necesitas un vehículo en tu garaje.',
      );
      return false;
    }
    if (category !== 'mixed' && myVehicle.kind !== category) {
      Alert.alert(
        'Categoría sin vehículo',
        `No tienes un vehículo de categoría ${vehicleCategoryLabel(category)}. Cambia la categoría o añade uno al garaje.`,
      );
      return false;
    }
    return true;
  };

  const sendChallenge = async () => {
    if (!rival) {
      Alert.alert('Elige un rival', 'Toca un amigo o usa el emparejamiento rápido.');
      return;
    }
    if (!ensureRealVehicle()) return;

    if (!isDemo) {
      try {
        const result = await createChallenge.mutateAsync({
          title: `Reto ${route.fromLabel.split(',')[0]} → ${route.toLabel}`,
          category,
          mode: 'scheduled',
          fromLabel: route.fromLabel,
          toLabel: route.toLabel,
          distanceKm: route.distanceKm,
          rules:
            category === 'mixed'
              ? 'Categoría mixta. Gana quien llegue primero respetando las normas de tránsito.'
              : `Categoría ${vehicleCategoryLabel(category)}. Solo compiten vehículos de la misma clase.`,
          hostVehicleId: myVehicle.id,
          hostVehicleKind: myVehicle.kind,
          invitees: [
            {
              userId: rival.id,
              vehicleId: rival.vehicleId,
              vehicleKind: rival.vehicleKind,
            },
          ],
        });
        setSentTo(rival.name);
        Alert.alert(
          'Reto enviado',
          `${rival.name.split(' ')[0]} recibió la invitación. Código ${result.code}. Cuando la acepte, podrás iniciar la salida.`,
        );
      } catch (error) {
        showError('No pudimos enviar el reto', error);
      }
      return;
    }

    const newChallenge: Challenge = {
      id: challengeId('c'),
      code: challengeCode('R'),
      title: `Reto ${route.fromLabel.split(',')[0]} → ${route.toLabel}`,
      fromLabel: route.fromLabel,
      toLabel: route.toLabel,
      distanceKm: route.distanceKm,
      category,
      status: 'pending',
      mode: 'scheduled',
      elapsedSeconds: 0,
      note:
        category === 'mixed'
          ? 'Categoría mixta. Cada vehículo corre con su propio ritmo y gana quien llegue primero respetando las normas.'
          : `Categoría ${vehicleCategoryLabel(category)}. Solo compiten vehículos de la misma clase.`,
      participants: [
        {
          id: me.id,
          name: me.name,
          username: me.username,
          color: me.color,
          vehicleKind: myVehicle.kind,
          vehicle: `${myVehicle.make} ${myVehicle.model}`,
          progress: 0,
          etaMin: route.etaMin,
          isMe: true,
        },
        {
          id: rival.id,
          name: rival.name,
          username: rival.username,
          color: rival.color,
          vehicleKind: rival.vehicleKind,
          vehicle: rival.car,
          progress: 0,
          etaMin: route.etaMin,
        },
      ],
    };
    setLocalActive(newChallenge);
    setSentTo(rival.name);
    Alert.alert(
      'Reto enviado',
      `${rival.name.split(' ')[0]} recibió la invitación. Cuando la acepte, ambos verán la salida y la meta en el mapa.`,
    );
  };

  const toggleInstantFriend = (friendId: string) => {
    setSentTo(null);
    setInstantSelectedIds((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId],
    );
  };

  const pickInstantRivals = () => {
    if (filteredFriends.length === 0) {
      Alert.alert('Sin pilotos disponibles', 'No hay amigos con ese tipo de vehículo. Prueba otra categoría.');
      return;
    }

    const online = filteredFriends.filter((friend) => friend.online);
    const pool = [...(online.length >= 2 ? online : filteredFriends)];
    const picks: string[] = [];
    while (picks.length < Math.min(2, pool.length)) {
      const index = Math.floor(Math.random() * pool.length);
      const [picked] = pool.splice(index, 1);
      picks.push(picked.id);
    }

    setInstantSelectedIds(picks);
    setSentTo(null);
  };

  const startInstantChallenge = async () => {
    if (selectedInstantFriends.length === 0) {
      Alert.alert('Elige al menos un piloto', 'Un reto al momento necesita 2+ personas: tú y al menos otro piloto.');
      return;
    }
    if (!ensureRealVehicle()) return;

    if (!isDemo) {
      try {
        const result = await createChallenge.mutateAsync({
          title: `Sala rápida · ${route.toLabel}`,
          category,
          mode: 'instant',
          fromLabel: route.fromLabel,
          toLabel: route.toLabel,
          distanceKm: route.distanceKm,
          rules:
            'Salida inmediata. Gana quien llegue primero a la meta respetando los límites de tránsito. Sin premios por velocidad máxima.',
          hostVehicleId: myVehicle.id,
          hostVehicleKind: myVehicle.kind,
          invitees: selectedInstantFriends.map((friend) => ({
            userId: friend.id,
            vehicleId: friend.vehicleId,
            vehicleKind: friend.vehicleKind,
          })),
        });
        setSentTo(null);
        Alert.alert(
          'Sala creada',
          `${selectedInstantFriends.length + 1} pilotos invitados hacia ${route.toLabel}. Código ${result.code}. Compártelo para que se unan.`,
        );
      } catch (error) {
        showError('No pudimos crear la sala', error);
      }
      return;
    }

    const code = challengeCode('S');
    const participants = [
      {
        id: me.id,
        name: me.name,
        username: me.username,
        color: me.color,
        vehicleKind: myVehicle.kind,
        vehicle: `${myVehicle.make} ${myVehicle.model}`,
        progress: 0,
        etaMin: route.etaMin,
        isMe: true,
      },
      ...selectedInstantFriends.map((friend) => ({
        id: friend.id,
        name: friend.name,
        username: friend.username,
        color: friend.color,
        vehicleKind: friend.vehicleKind,
        vehicle: friend.car,
        progress: 0,
        etaMin: route.etaMin,
      })),
    ];

    setLocalActive({
      id: challengeId('c_instant'),
      code,
      title: `Sala rápida · ${route.toLabel}`,
      fromLabel: route.fromLabel,
      toLabel: route.toLabel,
      distanceKm: route.distanceKm,
      category,
      status: 'live',
      mode: 'instant',
      elapsedSeconds: 0,
      note:
        'Salida inmediata. Gana quien llegue primero a la meta respetando los límites de tránsito. Sin premios por velocidad máxima.',
      participants,
    });
    setSentTo(null);
    Alert.alert(
      'Reto en marcha',
      `${participants.length} pilotos salen ahora hacia ${route.toLabel}. Comparte el código ${code} para que se unan.`,
    );
  };

  const promptInstantStart = () => {
    if (selectedInstantFriends.length === 0) {
      Alert.alert('Elige al menos un piloto', 'El reto al momento necesita 2+ personas en total.');
      return;
    }
    if (Platform.OS === 'web') {
      void startInstantChallenge();
      return;
    }
    Alert.alert(
      '¿Salir ahora?',
      `Tú y ${selectedInstantFriends.length} ${
        selectedInstantFriends.length === 1 ? 'piloto' : 'pilotos'
      } saldrán inmediatamente hacia ${route.toLabel}. El reto mide llegada, no velocidad.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir ahora', onPress: () => void startInstantChallenge() },
      ],
    );
  };

  const startChallenge = async () => {
    if (!isDemo) {
      if (!realActive) {
        Alert.alert('Sin reto', 'Crea o acepta un reto antes de iniciarlo.');
        return;
      }
      if (!realActive.isHost) {
        Alert.alert('Solo el anfitrión', 'El anfitrión del reto es quien puede iniciar la salida.');
        return;
      }
      if (!activeReadyToStart) {
        Alert.alert(
          'Faltan pilotos',
          'Necesitas al menos un rival que haya aceptado el reto para iniciar la salida.',
        );
        return;
      }
      try {
        await startRealChallenge.mutateAsync(realActive.id);
        setSentTo(null);
        Alert.alert('Reto iniciado', 'La salida está en marcha. Comparte el código con los pilotos.');
      } catch (error) {
        showError('No pudimos iniciar el reto', error);
      }
      return;
    }

    setLocalActive((previous) => ({
      ...previous,
      status: 'live',
      elapsedSeconds: 0,
      participants: previous.participants.map((participant, index) => ({
        ...participant,
        progress: index === 0 ? 2 : 1,
      })),
    }));
    setSentTo(null);
  };

  const finishChallenge = async () => {
    if (!isDemo) {
      if (!realActive) return;
      if (!realActive.isHost) {
        Alert.alert('Solo el anfitrión', 'El anfitrión es quien puede cerrar el reto.');
        return;
      }
      try {
        await finishRealChallenge.mutateAsync(realActive.id);
        Alert.alert('Reto finalizado', 'El resultado quedó guardado en el historial.');
      } catch (error) {
        showError('No pudimos finalizar el reto', error);
      }
      return;
    }

    setLocalActive((previous) => ({ ...previous, status: 'finished' }));
    const winner = standings[0];
    Alert.alert(
      'Reto finalizado',
      `${winner?.isMe ? 'Ganaste' : `${winner?.name ?? 'Tu rival'} ganó`} el reto. Tiempo: ${formatClock(
        active.elapsedSeconds,
      )}.`,
    );
  };

  const respondToChallenge = async (accept: boolean) => {
    if (!realActive) return;
    try {
      await respondChallenge.mutateAsync({ challengeId: realActive.id, accept });
      Alert.alert(
        accept ? 'Estás dentro' : 'Invitación rechazada',
        accept
          ? 'El anfitrión ya puede iniciar la salida. Te avisaremos cuando el reto esté en vivo.'
          : 'La invitación quedó rechazada. No se notificará a los demás pilotos.',
      );
    } catch (error) {
      showError('No pudimos responder', error);
    }
  };

  const shareChallenge = async () => {
    if (!hasActive) return;
    const label = active.mode === 'instant' ? 'Sala rápida de Caravana' : 'Reto de Caravana';
    await Share.share({
      message: `${label}: ${active.fromLabel} → ${active.toLabel} (${active.distanceKm} km). Únete con ${challengeUrl(active.code)}`,
      url: challengeUrl(active.code),
    });
  };

  const recentResults = isDemo
    ? recentChallenges
    : realHistory.map((challenge) => {
        const winner = challenge.participants.find(
          (participant) => participant.finishRank === 1,
        );
        return {
          id: challenge.id,
          title: challenge.title,
          category: challenge.category,
          fromLabel: challenge.fromLabel,
          toLabel: challenge.toLabel,
          distanceKm: Math.max(0, Math.round(challenge.distanceM / 100) / 10),
          winner: winner?.profile.displayName ?? 'Sin ganador registrado',
          winnerColor: winner
            ? profileColor(winner.profile.username)
            : colors.dim,
          time: challenge.finishedAt ? timeAgo(challenge.finishedAt) : 'Finalizado',
          date: `${challenge.participants.length} pilotos`,
        };
      });

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="label" color={colors.accent}>RETOS</AppText>
          <AppText variant="h1" style={{ marginTop: 4 }}>Desafía a tus amigos</AppText>
        </View>
        <IconButton icon="trophy-outline" tone="surface" />
      </View>

      {challengesLoading ? (
        <View style={styles.syncRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <AppText variant="caption" color={colors.muted}>Cargando tus retos…</AppText>
        </View>
      ) : null}

      {challengesError ? (
        <Card style={styles.errorCard}>
          <AppText variant="bodyStrong">No pudimos cargar tus retos</AppText>
          <AppText variant="caption" color={colors.muted}>
            Revisa tu conexión y vuelve a intentarlo.
          </AppText>
          <Button
            label="Reintentar"
            size="sm"
            variant="secondary"
            onPress={() => void refetchChallenges()}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      ) : null}

      <View style={styles.matchmakingPillRow}>
        <Pill
          label={challengeMode === 'instant' ? 'Reto al momento' : 'Modo programado'}
          tone="lime"
          icon={challengeMode === 'instant' ? 'flash' : 'calendar-outline'}
        />
        <Pill label="Punto A → punto B" tone="neutral" icon="flag-outline" />
      </View>

      <View style={styles.modeSwitch}>
        {modeOptions.map((option) => {
          const selected = option.key === challengeMode;
          return (
            <Pressable
              key={option.key}
              onPress={() => chooseMode(option.key)}
              style={[styles.modeOption, selected && styles.modeOptionActive]}
            >
              <View style={[styles.modeIcon, selected && styles.modeIconActive]}>
                <Ionicons
                  name={option.icon}
                  size={17}
                  color={selected ? '#120802' : colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong" color={selected ? colors.text : colors.textSoft}>
                  {option.label}
                </AppText>
                <AppText variant="caption" color={selected ? colors.muted : colors.dim} numberOfLines={1}>
                  {option.detail}
                </AppText>
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={17} color={colors.lime} /> : null}
            </Pressable>
          );
        })}
      </View>

      {hasActive ? (
        <ActiveChallengeCard
          active={active}
          standings={standings}
          isDemo={isDemo}
          activeIsInvite={activeIsInvite}
          activeIsWaiting={activeIsWaiting}
          activeIsHost={activeIsHost}
          activeHostReady={activeHostReady}
          activeReadyToStart={activeReadyToStart}
          respondPending={respondChallenge.isPending}
          startPending={startRealChallenge.isPending}
          finishPending={finishRealChallenge.isPending}
          onRespond={(accept) => void respondToChallenge(accept)}
          onStart={() => void startChallenge()}
          onFinish={() => void finishChallenge()}
          onShare={() => void shareChallenge()}
        />
      ) : (
        <Card style={styles.emptyActive}>
          <View style={styles.emptyActiveIcon}>
            <Ionicons name="flag-outline" size={24} color={colors.accent} />
          </View>
          <AppText variant="h2" align="center">Tu próximo reto empieza abajo</AppText>
          <AppText variant="caption" color={colors.muted} align="center" style={{ marginTop: 6 }}>
            Elige una ruta, una categoría y un piloto. La invitación llega a tu amigo al
            instante.
          </AppText>
        </Card>
      )}

      {sentTo ? (
        <Card style={styles.sentCard}>
          <View style={styles.sentIcon}>
            <Ionicons name="checkmark" size={18} color="#120802" />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">Reto enviado a {sentTo.split(' ')[0]}</AppText>
            <AppText variant="caption" color={colors.muted}>
              Comparte el código {active.code} por WhatsApp mientras esperas.
            </AppText>
          </View>
          <IconButton icon="share-social-outline" size={34} tone="ghost" onPress={shareChallenge} />
        </Card>
      ) : null}

      {hasActive ? <ChallengeStandings standings={standings} status={active.status} /> : null}

      <SectionHeader
        title={challengeMode === 'instant' ? 'Reto al momento' : 'Modo programado'}
        action="Cómo funciona"
        onAction={() =>
          Alert.alert(
            challengeMode === 'instant' ? 'Reto al momento' : 'Cómo funciona',
            challengeMode === 'instant'
              ? 'Elige una ruta A → B, una categoría y uno o más pilotos disponibles. Al confirmar, la sala empieza de inmediato con 2+ participantes y gana quien llegue primero a la meta respetando las normas. No se premia la velocidad máxima.'
              : 'Elige una ruta A → B y una categoría. La app busca un amigo disponible de esa categoría o te deja elegir uno. Al aceptar, ambos comparten progreso y el primero en entrar en la meta gana. No se premia la velocidad máxima.',
          )
        }
      />
      <Card style={styles.matchCard}>
        <View style={styles.matchHeading}>
          <View style={styles.matchIcon}>
            <Ionicons
              name={challengeMode === 'instant' ? 'flash' : 'git-compare-outline'}
              size={22}
              color={colors.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title">
              {challengeMode === 'instant' ? 'Arma la salida ahora' : 'Encuentra tu próximo reto'}
            </AppText>
            <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
              {challengeMode === 'instant'
                ? 'Ruta, categoría y 2+ pilotos. La sala arranca en cuanto confirmes.'
                : 'Elige ruta y categoría. Emparejamos un amigo disponible o eliges tú.'}
            </AppText>
          </View>
        </View>

        <RoutePicker
          routes={challengeRoutes}
          selectedId={selectedRouteId}
          onSelect={(id) => {
            setSelectedRouteId(id);
            setSentTo(null);
          }}
        />

        <CategoryPicker value={category} onSelect={chooseCategory} />

        <View style={styles.friendHeader}>
          <AppText variant="label" color={colors.muted} style={styles.stepLabel}>
            {challengeMode === 'instant' ? '3 · PILOTOS (2+)' : '3 · RIVAL'}
          </AppText>
          <Pressable
            onPress={challengeMode === 'instant' ? pickInstantRivals : matchmake}
            style={styles.quickMatch}
            disabled={matching}
          >
            {matching && challengeMode === 'scheduled' ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons
                name={challengeMode === 'instant' ? 'shuffle' : 'sparkles'}
                size={14}
                color={colors.lime}
              />
            )}
            <AppText variant="label" color={colors.lime} style={{ fontSize: 9 }}>
              {challengeMode === 'scheduled' && matching
                ? 'BUSCANDO…'
                : challengeMode === 'instant'
                  ? 'ELEGIR 2 ALEATORIOS'
                  : 'EMPAREJAMIENTO RÁPIDO'}
            </AppText>
          </Pressable>
        </View>

        <FriendPicker
          loading={friendsLoading}
          friends={filteredFriends}
          category={category}
          showFindFriends={!isDemo && challengeFriends.length === 0}
          isSelected={(friend) =>
            challengeMode === 'instant'
              ? instantSelectedIds.includes(friend.id)
              : friend.id === selectedFriendId
          }
          onPress={(friend) => {
            if (challengeMode === 'instant') {
              toggleInstantFriend(friend.id);
              return;
            }
            setSelectedFriendId(friend.id);
            setMatchedFriend(null);
            setSentTo(null);
          }}
          onFindFriends={() => router.push('/friends')}
        />

        {challengeMode === 'instant' ? (
          <>
            {selectedInstantFriends.length > 0 ? (
              <View style={styles.lineupCard}>
                <View style={styles.lineupAvatars}>
                  <Avatar name={me.name} color={me.color} size={38} ring={colors.surface} />
                  {selectedInstantFriends.map((friend, index) => (
                    <View key={friend.id} style={[styles.lineupAvatar, index === 0 && { marginLeft: -8 }]}>
                      <Avatar name={friend.name} color={friend.color} size={38} ring={colors.surface} />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">
                    {selectedInstantFriends.length + 1} pilotos listos
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    Tú y {selectedInstantFriends.map((friend) => friend.name.split(' ')[0]).join(', ')}
                  </AppText>
                </View>
                <Pill label="2+" tone="lime" icon="people" />
              </View>
            ) : (
              <View style={styles.instantHint}>
                <Ionicons name="flash-outline" size={18} color={colors.accent} />
                <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
                  Elige al menos un piloto para formar una sala de 2+ personas. También puedes usar
                  “Elegir 2 aleatorios”.
                </AppText>
              </View>
            )}

            <Button
              label={
                selectedInstantFriends.length > 0
                  ? `Salir ahora con ${selectedInstantFriends.length + 1} pilotos`
                  : 'Elige 2+ pilotos'
              }
              icon="flash"
              onPress={promptInstantStart}
              disabled={selectedInstantFriends.length === 0}
              style={{ marginTop: spacing.md }}
            />
            <AppText variant="caption" color={colors.dim} align="center" style={{ marginTop: 8 }}>
              La sala empieza al confirmar. Gana quien llega primero a la meta respetando las normas.
            </AppText>
          </>
        ) : (
          <>
            {rival ? (
              <View style={styles.rivalCard}>
                <Avatar name={rival.name} color={rival.color} size={42} online />
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">
                    {matchedFriend ? 'Rival encontrado' : 'Rival seleccionado'}: {rival.name}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {rival.car} · {vehicleCategoryLabel(rival.vehicleKind)}
                  </AppText>
                </View>
                <Pill
                  label={rival.online ? 'En línea' : 'Disponible'}
                  tone={rival.online ? 'lime' : 'neutral'}
                />
              </View>
            ) : null}

            <Button
              label={rival ? `Enviar reto a ${rival.name.split(' ')[0]}` : 'Elige un rival'}
              icon="flag"
              onPress={sendChallenge}
              disabled={!rival}
              style={{ marginTop: spacing.md }}
            />
            <AppText variant="caption" color={colors.dim} align="center" style={{ marginTop: 8 }}>
              Sin apuestas. Sin rankings de velocidad. El reto mide llegada, no imprudencia.
            </AppText>
          </>
        )}
      </Card>

      <SectionHeader
        title="Resultados recientes"
        action={isDemo ? 'Ver todos' : recentResults.length ? `${recentResults.length}` : undefined}
      />
      <RecentResults results={recentResults} />

      <Card style={styles.safetyCard}>
        <View style={styles.safetyIcon}>
          <Ionicons name="shield-checkmark" size={20} color={colors.lime} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">Retos responsables</AppText>
          <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
            No fomentamos carreras ilegales ni premiamos la velocidad máxima. Gana quien llega
            primero cumpliendo los límites y las normas de tránsito.
          </AppText>
        </View>
      </Card>

      <View style={styles.footer}>
        <Ionicons name="people-outline" size={13} color={colors.dim} />
        <AppText variant="caption" color={colors.dim}>
          Categorías separadas para coches, motos, EV y camiones.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  errorCard: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  matchmakingPillRow: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
  modeSwitch: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.md,
  },
  modeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  modeOptionActive: {
    borderColor: 'rgba(201,255,77,0.35)',
    backgroundColor: 'rgba(201,255,77,0.06)',
  },
  modeIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconActive: {
    backgroundColor: colors.lime,
  },
  emptyActive: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.xl,
  },
  emptyActiveIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    borderColor: 'rgba(201,255,77,0.25)',
  },
  sentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchCard: { gap: 4 },
  matchHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  matchIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: { marginTop: spacing.lg, marginBottom: 8 },
  friendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickMatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingLeft: 8,
  },
  rivalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.25)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  lineupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,90,31,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.3)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  lineupAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineupAvatar: {
    borderWidth: 2,
    borderColor: colors.surface,
    borderRadius: 21,
  },
  instantHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  safetyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.md,
    borderColor: 'rgba(201,255,77,0.18)',
    backgroundColor: 'rgba(201,255,77,0.04)',
  },
  safetyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
});
