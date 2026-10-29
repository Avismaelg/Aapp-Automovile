import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';

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
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { emptyChallenge, realChallengeToChallenge, type ChallengeFriend } from '@/src/lib/challenge-db';
import { formatClock, timeAgo } from '@/src/lib/format';
import { profileColor } from '@/src/lib/profile-db';
import { challengeUrl } from '@/src/lib/qr';
import { colors } from '@/src/theme';
import { vehicleCategoryLabel } from '@/src/lib/vehicles';

function challengeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function challengeCode(prefix: 'R' | 'S') {
  return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

export type ChallengeMode = 'instant' | 'scheduled';

// Estado, datos derivados y acciones de la pantalla de retos (demo y real).
// La pantalla solo pinta lo que devuelve.
export function useChallengeScreen() {
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

  const selectRoute = (id: string) => {
    setSelectedRouteId(id);
    setSentTo(null);
  };

  const isFriendSelected = (friend: ChallengeFriend) =>
    challengeMode === 'instant'
      ? instantSelectedIds.includes(friend.id)
      : friend.id === selectedFriendId;

  // Al momento se eligen varios pilotos; programado, un solo rival.
  const pressFriend = (friend: ChallengeFriend) => {
    if (challengeMode === 'instant') {
      toggleInstantFriend(friend.id);
      return;
    }
    setSelectedFriendId(friend.id);
    setMatchedFriend(null);
    setSentTo(null);
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

  return {
    active,
    activeHostReady,
    activeIsHost,
    activeIsInvite,
    activeIsWaiting,
    activeReadyToStart,
    category,
    challengeFriends,
    challengeMode,
    challengesError,
    challengesLoading,
    chooseCategory,
    chooseMode,
    filteredFriends,
    finishChallenge,
    finishRealChallenge,
    friendsLoading,
    hasActive,
    isDemo,
    isFriendSelected,
    matchedFriend,
    matching,
    matchmake,
    me,
    pickInstantRivals,
    pressFriend,
    promptInstantStart,
    recentResults,
    refetchChallenges,
    respondChallenge,
    respondToChallenge,
    rival,
    router,
    selectRoute,
    selectedInstantFriends,
    selectedRouteId,
    sendChallenge,
    sentTo,
    shareChallenge,
    standings,
    startChallenge,
    startRealChallenge,
  };
}
