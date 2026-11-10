import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Share } from 'react-native';

import { activeChallenge, challengeRoutes, recentChallenges } from '@/src/data/mock';
import { showError } from '@/src/lib/alerts';
import type { Challenge, ChallengeCategory } from '@/src/types/models';
import {
  useChallengeFriends,
  useChallenges,
  useCreateChallenge,
  useAbandonChallenge,
  useFinishChallenge,
  useRespondChallenge,
  useStartChallenge,
} from '@/src/hooks/useChallenges';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useLivePoll } from '@/src/hooks/useLivePoll';
import { useCreatePost } from '@/src/hooks/useFeed';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { emptyChallenge, realChallengeToChallenge, type ChallengeFriend } from '@/src/lib/challenge-db';
import { formatClock, timeAgo } from '@/src/lib/format';
import { profileColor } from '@/src/lib/profile-db';
import { challengeUrl } from '@/src/lib/qr';
import { colors } from '@/src/theme';
import { vehicleCategoryLabel } from '@/src/lib/vehicles';
import { t } from '@/src/i18n';

function challengeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000)}`;
}

function challengeCode(prefix: 'R' | 'S') {
  return `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
}

export type ChallengeMode = 'instant' | 'scheduled';

// Estado, datos derivados y acciones de la pantalla de retos (demo y real).
// La pantalla solo pinta lo que devuelve.
// RETO-06: aviso de conducción responsable antes de cada reto.
export function confirmResponsibleDriving(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      t('Conducción responsable'),
      t('Gana quien llegue primero respetando las leyes de tránsito. Caravana no mide ni premia la velocidad. ¿Lo aceptas?'),
      [
        { text: t('Cancelar'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('Acepto'), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

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
  const abandonRealChallenge = useAbandonChallenge();
  const createPost = useCreatePost();
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
  // Reloj del reto en curso: cada segundo, solo con la pantalla de Retos a la
  // vista (las pestañas siguen montadas aunque estés en otra).
  const clockTick = useLivePoll(1_000);
  const matchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (isDemo || realActive?.status !== 'live' || !clockTick) return;
    const timer = setInterval(() => setNow(Date.now()), clockTick);
    return () => clearInterval(timer);
  }, [isDemo, realActive?.id, realActive?.status, clockTick]);

  // El emparejamiento a medias no actualiza una pantalla ya cerrada.
  useEffect(() => () => {
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
  }, []);

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
      Alert.alert(t('Sin rivales'), t('No tienes amigos con ese tipo de vehículo. Prueba otra categoría.'));
      return;
    }
    setMatching(true);
    setMatchedFriend(null);
    setSentTo(null);
    if (matchTimerRef.current) clearTimeout(matchTimerRef.current);
    matchTimerRef.current = setTimeout(() => {
      matchTimerRef.current = null;
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
        t('Añade un vehículo'),
        t('Para crear un reto real necesitas un vehículo en tu garaje.'),
      );
      return false;
    }
    if (category !== 'mixed' && myVehicle.kind !== category) {
      Alert.alert(
        t('Categoría sin vehículo'),
        t('No tienes un vehículo de categoría {0}. Cambia la categoría o añade uno al garaje.', vehicleCategoryLabel(category)),
      );
      return false;
    }
    return true;
  };

  const sendChallenge = async () => {
    if (!rival) {
      Alert.alert(t('Elige un rival'), t('Toca un amigo o usa el emparejamiento rápido.'));
      return;
    }
    if (!ensureRealVehicle()) return;

    if (!isDemo) {
      try {
        const result = await createChallenge.mutateAsync({
          title: t('Reto {0} → {1}', route.fromLabel.split(',')[0], route.toLabel),
          category,
          mode: 'scheduled',
          fromLabel: route.fromLabel,
          toLabel: route.toLabel,
          distanceKm: route.distanceKm,
          rules:
            category === 'mixed'
              ? t('Categoría mixta. Gana quien llegue primero respetando las normas de tránsito.')
              : t('Categoría {0}. Solo compiten vehículos de la misma clase.', vehicleCategoryLabel(category)),
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
          t('Reto enviado'),
          t('{0} recibió la invitación. Código {1}. Cuando la acepte, podrás iniciar la salida.', rival.name.split(' ')[0], result.code),
        );
      } catch (error) {
        showError(t('No pudimos enviar el reto'), error);
      }
      return;
    }

    const newChallenge: Challenge = {
      id: challengeId('c'),
      code: challengeCode('R'),
      title: t('Reto {0} → {1}', route.fromLabel.split(',')[0], route.toLabel),
      fromLabel: route.fromLabel,
      toLabel: route.toLabel,
      distanceKm: route.distanceKm,
      category,
      status: 'pending',
      mode: 'scheduled',
      elapsedSeconds: 0,
      note:
        category === 'mixed'
          ? t('Categoría mixta. Cada vehículo corre con su propio ritmo y gana quien llegue primero respetando las normas.')
          : t('Categoría {0}. Solo compiten vehículos de la misma clase.', vehicleCategoryLabel(category)),
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
      t('Reto enviado'),
      t('{0} recibió la invitación. Cuando la acepte, ambos verán la salida y la meta en el mapa.', rival.name.split(' ')[0]),
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
      Alert.alert(t('Sin pilotos disponibles'), t('No hay amigos con ese tipo de vehículo. Prueba otra categoría.'));
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
      Alert.alert(t('Elige al menos un piloto'), t('Un reto al momento necesita 2+ personas: tú y al menos otro piloto.'));
      return;
    }
    if (!ensureRealVehicle()) return;

    if (!isDemo) {
      try {
        const result = await createChallenge.mutateAsync({
          title: t('Sala rápida · {0}', route.toLabel),
          category,
          mode: 'instant',
          fromLabel: route.fromLabel,
          toLabel: route.toLabel,
          distanceKm: route.distanceKm,
          rules:
            t('Salida inmediata. Gana quien llegue primero a la meta respetando los límites de tránsito. Sin premios por velocidad máxima.'),
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
          t('Sala creada'),
          t('{0} pilotos invitados hacia {1}. Código {2}. Compártelo para que se unan.', selectedInstantFriends.length + 1, route.toLabel, result.code),
        );
      } catch (error) {
        showError(t('No pudimos crear la sala'), error);
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
      title: t('Sala rápida · {0}', route.toLabel),
      fromLabel: route.fromLabel,
      toLabel: route.toLabel,
      distanceKm: route.distanceKm,
      category,
      status: 'live',
      mode: 'instant',
      elapsedSeconds: 0,
      note:
        t('Salida inmediata. Gana quien llegue primero a la meta respetando los límites de tránsito. Sin premios por velocidad máxima.'),
      participants,
    });
    setSentTo(null);
    Alert.alert(
      t('Reto en marcha'),
      t('{0} pilotos salen ahora hacia {1}. Comparte el código {2} para que se unan.', participants.length, route.toLabel, code),
    );
  };

  const promptInstantStart = () => {
    if (selectedInstantFriends.length === 0) {
      Alert.alert(t('Elige al menos un piloto'), t('El reto al momento necesita 2+ personas en total.'));
      return;
    }
    if (Platform.OS === 'web') {
      void startInstantChallenge();
      return;
    }
    Alert.alert(
      t('¿Salir ahora?'),
      t('Tú y {0} {1} saldrán inmediatamente hacia {2}. El reto mide llegada, no velocidad.', selectedInstantFriends.length, selectedInstantFriends.length === 1 ? 'piloto' : 'pilotos', route.toLabel),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { text: t('Salir ahora'), onPress: () => void startInstantChallenge() },
      ],
    );
  };

  const startChallenge = async () => {
    if (!isDemo) {
      if (!realActive) {
        Alert.alert(t('Sin reto'), t('Crea o acepta un reto antes de iniciarlo.'));
        return;
      }
      if (!realActive.isHost) {
        Alert.alert(t('Solo el anfitrión'), t('El anfitrión del reto es quien puede iniciar la salida.'));
        return;
      }
      if (!activeReadyToStart) {
        Alert.alert(
          t('Faltan pilotos'),
          t('Necesitas al menos un rival que haya aceptado el reto para iniciar la salida.'),
        );
        return;
      }
      try {
        await startRealChallenge.mutateAsync(realActive.id);
        setSentTo(null);
        Alert.alert(t('Reto iniciado'), t('La salida está en marcha. Comparte el código con los pilotos.'));
      } catch (error) {
        showError(t('No pudimos iniciar el reto'), error);
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
        Alert.alert(t('Solo el anfitrión'), t('El anfitrión es quien puede cerrar el reto.'));
        return;
      }
      try {
        await finishRealChallenge.mutateAsync(realActive.id);
        Alert.alert(t('Reto finalizado'), t('El resultado quedó guardado en el historial.'));
      } catch (error) {
        showError(t('No pudimos finalizar el reto'), error);
      }
      return;
    }

    setLocalActive((previous) => ({ ...previous, status: 'finished' }));
    const winner = standings[0];
    Alert.alert(
      t('Reto finalizado'),
      t('{0} el reto. Tiempo: {1}.', winner?.isMe ? 'Ganaste' : `${winner?.name ?? 'Tu rival'} ganó`, formatClock(
        active.elapsedSeconds,
      )),
    );
  };

  // RETO-06: aceptar exige confirmar la conducción responsable.
  const respondToChallenge = async (accept: boolean) => {
    if (!realActive) return;
    if (accept && !(await confirmResponsibleDriving())) return;
    try {
      await respondChallenge.mutateAsync({ challengeId: realActive.id, accept });
      Alert.alert(
        accept ? t('Estás dentro') : t('Invitación rechazada'),
        accept
          ? t('El anfitrión ya puede iniciar la salida. Te avisaremos cuando el reto esté en vivo.')
          : t('La invitación quedó rechazada. No se notificará a los demás pilotos.'),
      );
    } catch (error) {
      showError(t('No pudimos responder'), error);
    }
  };

  const shareChallenge = async () => {
    if (!hasActive) return;
    const label = active.mode === 'instant' ? t('Sala rápida de Caravana') : t('Reto de Caravana');
    await Share.share({
      message: t('{0}: {1} → {2} ({3} km). Únete con {4}', label, active.fromLabel, active.toLabel, active.distanceKm, challengeUrl(active.code)),
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
          winner: winner?.profile.displayName ?? t('Sin ganador registrado'),
          winnerColor: winner
            ? profileColor(winner.profile.username)
            : colors.dim,
          time: challenge.finishedAt ? timeAgo(challenge.finishedAt) : t('Finalizado'),
          date: `${challenge.participants.length} pilotos`,
        };
      });

  // RETO-07: abandonar (el reto sigue para los demás).
  const abandonChallenge = () => {
    if (!realActive) return;
    Alert.alert(t('¿Abandonar el reto?'), t('Quedarás como «abandonó» y el reto sigue para los demás.'), [
      { text: t('Seguir'), style: 'cancel' },
      {
        text: t('Abandonar'),
        style: 'destructive',
        onPress: () =>
          void abandonRealChallenge
            .mutateAsync(realActive.id)
            .catch((error) => showError(t('No pudimos abandonar'), error)),
      },
    ]);
  };

  // RETO-08: el resultado al feed (orden de llegada, sin velocidades).
  const publishResult = async () => {
    if (!realActive) return;
    const podium = [...realActive.participants]
      .filter((participant) => participant.finishRank != null)
      .sort((a, b) => (a.finishRank as number) - (b.finishRank as number))
      .map((participant) => `${participant.finishRank}. ${participant.profile.displayName}`);
    try {
      await createPost.mutateAsync({
        caption: [
          t('🏁 Reto por llegada: {0}', realActive.title),
          t('Meta: {0}', realActive.toLabel),
          ...podium,
        ].join('\n'),
        visibility: 'friends',
      });
      Alert.alert(t('Publicado'), t('Tus amigos verán el resultado en el feed.'));
    } catch (error) {
      showError(t('No pudimos publicar'), error);
    }
  };

  return {
    abandonChallenge,
    abandonPending: abandonRealChallenge.isPending,
    publishResult,
    publishPending: createPost.isPending,
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
