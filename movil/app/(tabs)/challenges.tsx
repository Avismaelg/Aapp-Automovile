import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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
import {
  activeChallenge,
  challengeRoutes,
  friends,
  recentChallenges,
  type Challenge,
  type ChallengeCategory,
  type Friend,
} from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useGarageVehicles } from '@/src/hooks/useGarage';
import { formatClock } from '@/src/lib/format';
import { challengeUrl } from '@/src/lib/qr';
import { colors, radius, spacing } from '@/src/theme';
import {
  vehicleCategoryLabel,
  vehicleKindMeta,
  vehicleKinds,
} from '@/src/lib/vehicles';

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

const categoryOptions: {
  key: ChallengeCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'mixed', label: 'Mixto', icon: 'shuffle' },
  ...vehicleKinds.map((kind) => ({
    key: kind,
    label: vehicleKindMeta[kind].shortLabel,
    icon: vehicleKindMeta[kind].icon,
  })),
];

function RouteMini({
  fromLabel,
  toLabel,
  distanceKm,
}: {
  fromLabel: string;
  toLabel: string;
  distanceKm: number;
}) {
  return (
    <View style={styles.routeMini}>
      <Svg width="100%" height={86} viewBox="0 0 320 86" preserveAspectRatio="none">
        <Path d="M0 26 C 52 22, 74 8, 120 18 S 200 58, 246 48 S 290 26, 320 30" stroke="#17212B" strokeWidth={14} fill="none" />
        <Path
          d="M18 70 C 70 70, 74 34, 138 34 S 222 68, 300 20"
          stroke={colors.accent}
          strokeWidth={10}
          fill="none"
          opacity={0.12}
          strokeLinecap="round"
        />
        <Path
          d="M18 70 C 70 70, 74 34, 138 34 S 222 68, 300 20"
          stroke={colors.accent}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeDasharray="8 7"
        />
        <Circle cx={18} cy={70} r={7} fill={colors.lime} />
        <Circle cx={18} cy={70} r={13} fill={colors.lime} opacity={0.2} />
        <Circle cx={300} cy={20} r={7} fill={colors.accent} />
        <Circle cx={300} cy={20} r={13} fill={colors.accent} opacity={0.2} />
      </Svg>
      <View style={styles.routeMiniLabels}>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={colors.lime} style={{ fontSize: 8 }}>SALIDA</AppText>
          <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>{fromLabel}</AppText>
        </View>
        <View style={styles.routeDistance}>
          <Ionicons name="navigate" size={11} color={colors.muted} />
          <AppText variant="label" color={colors.muted} style={{ fontSize: 9 }}>{distanceKm} KM</AppText>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <AppText variant="label" color={colors.accent} style={{ fontSize: 8 }}>META</AppText>
          <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>{toLabel}</AppText>
        </View>
      </View>
    </View>
  );
}

export default function ChallengesScreen() {
  const me = useCurrentUser();
  const { vehicles: garageVehicles } = useGarageVehicles();
  const [active, setActive] = useState<Challenge>(activeChallenge);
  const [selectedRouteId, setSelectedRouteId] = useState(challengeRoutes[1].id);
  const [category, setCategory] = useState<ChallengeCategory>('mixed');
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>('instant');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [instantSelectedIds, setInstantSelectedIds] = useState<string[]>([]);
  const [matchedFriend, setMatchedFriend] = useState<Friend | null>(null);
  const [matching, setMatching] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const route = challengeRoutes.find((item) => item.id === selectedRouteId) ?? challengeRoutes[1];
  const filteredFriends = useMemo(
    () =>
      category === 'mixed'
        ? friends
        : friends.filter((friend) => friend.vehicleKind === category),
    [category],
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

  const standings = useMemo(
    () => [...active.participants].sort((a, b) => b.progress - a.progress),
    [active.participants],
  );

  useEffect(() => {
    if (active.status !== 'live') return;
    const timer = setInterval(() => {
      setActive((previous) =>
        previous.status === 'live'
          ? { ...previous, elapsedSeconds: previous.elapsedSeconds + 1 }
          : previous,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [active.status]);

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

  const sendChallenge = () => {
    if (!rival) {
      Alert.alert('Elige un rival', 'Toca un amigo o usa el emparejamiento rápido.');
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
    setActive(newChallenge);
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

  const startInstantChallenge = () => {
    if (selectedInstantFriends.length === 0) {
      Alert.alert('Elige al menos un piloto', 'Un reto al momento necesita 2+ personas: tú y al menos otro piloto.');
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

    setActive({
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
      startInstantChallenge();
      return;
    }
    Alert.alert(
      '¿Salir ahora?',
      `Tú y ${selectedInstantFriends.length} ${
        selectedInstantFriends.length === 1 ? 'piloto' : 'pilotos'
      } saldrán inmediatamente hacia ${route.toLabel}. El reto mide llegada, no velocidad.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir ahora', onPress: startInstantChallenge },
      ],
    );
  };

  const startChallenge = () => {
    setActive((previous) => ({
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

  const finishChallenge = () => {
    setActive((previous) => ({ ...previous, status: 'finished' }));
    const winner = standings[0];
    Alert.alert(
      'Reto finalizado',
      `${winner?.isMe ? 'Ganaste' : `${winner?.name ?? 'Tu rival'} ganó`} el reto. Tiempo: ${formatClock(
        active.elapsedSeconds,
      )}.`,
    );
  };

  const shareChallenge = async () => {
    const label = active.mode === 'instant' ? 'Sala rápida de Caravana' : 'Reto de Caravana';
    await Share.share({
      message: `${label}: ${active.fromLabel} → ${active.toLabel} (${active.distanceKm} km). Únete con ${challengeUrl(active.code)}`,
      url: challengeUrl(active.code),
    });
  };

  const categoryNote =
    category === 'mixed'
      ? 'Mixto: coches, motos, EV y camiones compiten por llegada. Sin premios por velocidad máxima.'
      : category === 'ev'
        ? 'EV: cuenta la autonomía y las paradas de carga. La batería forma parte del reto.'
        : category === 'truck'
          ? 'Camiones: categoría propia, con límites de peso y conducción profesional.'
          : category === 'motorcycle'
            ? 'Motos: categoría propia. Equipo completo y conducción defensiva.'
            : 'Coches: categoría propia. Gana quien llega primero respetando las normas.';

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="label" color={colors.accent}>RETOS</AppText>
          <AppText variant="h1" style={{ marginTop: 4 }}>Desafía a tus amigos</AppText>
        </View>
        <IconButton icon="trophy-outline" tone="surface" />
      </View>

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

      <LinearGradient
        colors={['#2A170F', '#17181D', '#0E1217']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.liveCard}
      >
        <View style={styles.liveGlow} />
        <View style={styles.liveTop}>
          <Pill
            label={active.status === 'live' ? 'Reto en vivo' : active.status === 'pending' ? 'Invitación pendiente' : 'Reto finalizado'}
            tone={active.status === 'live' ? 'danger' : active.status === 'pending' ? 'accent' : 'neutral'}
            icon={active.status === 'live' ? 'radio' : active.status === 'pending' ? 'mail-unread' : 'checkmark-circle'}
          />
          <Pill
            label={active.category === 'mixed' ? 'Mixto' : vehicleKindMeta[active.category].shortLabel}
            tone="dark"
          />
        </View>

        <AppText variant="h2" style={{ marginTop: spacing.lg }}>{active.title}</AppText>
        <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
          {active.status === 'live'
            ? `${active.mode === 'instant' ? 'Sala rápida' : 'En curso'} · ${standings.length} participantes · código ${active.code}`
            : active.status === 'pending'
              ? 'Esperando que tu rival acepte el reto'
              : 'Resultado final del reto'}
        </AppText>

        <RouteMini
          fromLabel={active.fromLabel}
          toLabel={active.toLabel}
          distanceKm={active.distanceKm}
        />

        <View style={styles.liveStats}>
          <View style={[styles.liveStat, styles.liveStatTime]}>
            <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>TIEMPO</AppText>
            <AppText
              variant="mono"
              color={colors.accent}
              numberOfLines={1}
              style={{ fontSize: 15 }}
            >
              {formatClock(active.elapsedSeconds)}
            </AppText>
          </View>
          <View style={styles.liveDivider} />
          <View style={styles.liveStat}>
            <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>DISTANCIA</AppText>
            <AppText variant="h3" numberOfLines={1} style={{ fontSize: 18 }}>
              {active.distanceKm} km
            </AppText>
          </View>
          <View style={styles.liveDivider} />
          <View style={styles.liveStat}>
            <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>LÍDER</AppText>
            <AppText variant="h3" color={colors.lime} numberOfLines={1} style={{ fontSize: 18 }}>
              {standings[0]?.isMe ? 'Tú' : standings[0]?.name.split(' ')[0] ?? '—'}
            </AppText>
          </View>
          <View style={styles.liveDivider} />
          <View style={styles.liveStat}>
            <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>CATEGORÍA</AppText>
            <AppText variant="h3" numberOfLines={1} style={{ fontSize: 18 }}>
              {active.category === 'mixed' ? 'Mixto' : vehicleKindMeta[active.category].shortLabel}
            </AppText>
          </View>
        </View>

        <View style={styles.liveActions}>
          <Button
            label={active.status === 'pending' ? 'Iniciar reto' : active.status === 'live' ? 'Finalizar reto' : 'Compartir resultado'}
            icon={active.status === 'pending' ? 'flag' : active.status === 'live' ? 'stop-circle-outline' : 'share-outline'}
            onPress={
              active.status === 'pending'
                ? startChallenge
                : active.status === 'live'
                  ? finishChallenge
                  : shareChallenge
            }
            style={{ flex: 1 }}
          />
          <Button
            label="Compartir"
            icon="share-social-outline"
            variant="secondary"
            full={false}
            onPress={shareChallenge}
            style={{ paddingHorizontal: 16 }}
          />
        </View>
      </LinearGradient>

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

      <SectionHeader title="Clasificación" action={active.status === 'live' ? 'En vivo' : undefined} />
      <Card style={styles.standingsCard}>
        {standings.map((participant, index) => {
          const kind = vehicleKindMeta[participant.vehicleKind];
          return (
            <View
              key={participant.id}
              style={[styles.standingRow, participant.isMe && styles.standingMe]}
            >
              <View style={[styles.rank, index === 0 && styles.rankFirst]}>
                <AppText variant="label" color={index === 0 ? '#120802' : colors.muted} style={{ fontSize: 10 }}>
                  {index + 1}
                </AppText>
              </View>
              <Avatar name={participant.name} color={participant.color} size={38} online />
              <View style={styles.standingMain}>
                <View style={styles.standingNameRow}>
                  <AppText variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {participant.isMe ? 'Tú' : participant.name.split(' ')[0]}
                  </AppText>
                  <View style={[styles.kindBadge, { borderColor: `${kind.color}55` }]}>
                    <Ionicons name={kind.icon} size={10} color={kind.color} />
                    <AppText variant="label" color={kind.color} style={{ fontSize: 8 }}>
                      {kind.shortLabel.toUpperCase()}
                    </AppText>
                  </View>
                </View>
                <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                  {participant.vehicle}
                </AppText>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${participant.progress}%`,
                        backgroundColor: participant.isMe ? colors.accent : kind.color,
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.standingRight}>
                <AppText variant="bodyStrong" color={participant.isMe ? colors.accent : colors.text}>
                  {participant.progress}%
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {active.status === 'finished' ? 'llegada' : `ETA ${participant.etaMin} m`}
                </AppText>
              </View>
            </View>
          );
        })}
      </Card>

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

        <AppText variant="label" color={colors.muted} style={styles.stepLabel}>1 · RUTA</AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {challengeRoutes.map((item) => {
            const selected = item.id === selectedRouteId;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSelectedRouteId(item.id);
                  setSentTo(null);
                }}
                style={[styles.routeChip, selected && styles.routeChipActive]}
              >
                <AppText variant="caption" color={selected ? colors.text : colors.textSoft} numberOfLines={1}>
                  {item.fromLabel.split(',')[0]} → {item.toLabel}
                </AppText>
                <AppText variant="label" color={selected ? colors.accent : colors.dim} style={{ fontSize: 8, marginTop: 2 }}>
                  {item.distanceKm} KM · {item.etaMin} MIN
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <AppText variant="label" color={colors.muted} style={styles.stepLabel}>2 · CATEGORÍA</AppText>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {categoryOptions.map((option) => {
            const selected = option.key === category;
            const tint =
              option.key === 'mixed' ? colors.accent : vehicleKindMeta[option.key].color;
            return (
              <Pressable
                key={option.key}
                onPress={() => chooseCategory(option.key)}
                style={[
                  styles.categoryChip,
                  selected && { borderColor: tint, backgroundColor: `${tint}14` },
                ]}
              >
                <Ionicons name={option.icon} size={17} color={selected ? tint : colors.muted} />
                <AppText variant="caption" color={selected ? colors.text : colors.muted}>
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.categoryNote}>
          <Ionicons name="information-circle-outline" size={15} color={colors.cyan} />
          <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>{categoryNote}</AppText>
        </View>

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

        {filteredFriends.length === 0 ? (
          <View style={styles.noRivals}>
            <Ionicons name="people-outline" size={22} color={colors.dim} />
            <AppText variant="caption" color={colors.muted}>
              No tienes amigos con {vehicleCategoryLabel(category).toLowerCase()}. Invita a uno o cambia de categoría.
            </AppText>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendRow}
          >
            {filteredFriends.map((friend) => {
              const kind = vehicleKindMeta[friend.vehicleKind];
              const selected =
                challengeMode === 'instant'
                  ? instantSelectedIds.includes(friend.id)
                  : friend.id === selectedFriendId;
              return (
                <Pressable
                  key={friend.id}
                  onPress={() => {
                    if (challengeMode === 'instant') {
                      toggleInstantFriend(friend.id);
                      return;
                    }
                    setSelectedFriendId(friend.id);
                    setMatchedFriend(null);
                    setSentTo(null);
                  }}
                  style={[styles.friendCard, selected && styles.friendCardActive]}
                >
                  <Avatar name={friend.name} color={friend.color} size={44} online={friend.online} />
                  <AppText variant="caption" color={colors.textSoft} numberOfLines={1} style={{ marginTop: 6 }}>
                    {friend.name.split(' ')[0]}
                  </AppText>
                  <View style={styles.friendKind}>
                    <Ionicons name={kind.icon} size={10} color={kind.color} />
                    <AppText variant="label" color={kind.color} style={{ fontSize: 7 }}>
                      {kind.shortLabel.toUpperCase()}
                    </AppText>
                  </View>
                  {selected ? (
                    <View style={styles.friendCheck}>
                      <Ionicons name="checkmark" size={10} color="#120802" />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

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

      <SectionHeader title="Resultados recientes" action="Ver todos" />
      {recentChallenges.map((item) => (
        <Card key={item.id} style={styles.recentCard}>
          <View style={[styles.recentIcon, { backgroundColor: `${item.winnerColor}1A` }]}>
            <Ionicons name="trophy" size={18} color={item.winnerColor} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.recentTop}>
              <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{item.title}</AppText>
              <Pill label={vehicleCategoryLabel(item.category)} tone="neutral" />
            </View>
            <AppText variant="caption" color={colors.muted} style={{ marginTop: 2 }}>
              {item.fromLabel} → {item.toLabel} · {item.distanceKm} km
            </AppText>
            <View style={styles.recentBottom}>
              <Ionicons name="trophy-outline" size={11} color={item.winnerColor} />
              <AppText variant="caption" color={item.winnerColor}>Ganó {item.winner}</AppText>
              <View style={styles.metaDot} />
              <AppText variant="caption" color={colors.dim}>{item.time}</AppText>
              <View style={styles.metaDot} />
              <AppText variant="caption" color={colors.dim}>{item.date}</AppText>
            </View>
          </View>
        </Card>
      ))}

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
  liveCard: {
    marginTop: spacing.lg,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.25)',
    padding: spacing.xl,
    overflow: 'hidden',
  },
  liveGlow: {
    position: 'absolute',
    top: -150,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,90,31,0.12)',
  },
  liveTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeMini: {
    marginTop: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    overflow: 'hidden',
  },
  routeMiniLabels: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  routeDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  liveStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  liveStat: { flex: 1, gap: 2 },
  liveStatTime: { flex: 1.45 },
  liveDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 8 },
  liveActions: { flexDirection: 'row', gap: 8, marginTop: spacing.lg },
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
  standingsCard: { paddingVertical: 4, paddingHorizontal: spacing.md },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  standingMe: {},
  rank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankFirst: { backgroundColor: colors.lime },
  standingMain: { flex: 1, minWidth: 0 },
  standingNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: '100%', borderRadius: 2 },
  standingRight: { alignItems: 'flex-end', minWidth: 52 },
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
  chipRow: { gap: 8, paddingRight: spacing.lg },
  routeChip: {
    width: 176,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  routeChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  categoryNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: spacing.md,
    backgroundColor: 'rgba(77,225,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(77,225,255,0.12)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
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
  noRivals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  friendRow: { gap: 8, paddingRight: spacing.lg },
  friendCard: {
    width: 80,
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 8,
  },
  friendCardActive: { borderColor: colors.lime, backgroundColor: colors.limeSoft },
  friendKind: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  friendCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.lime,
    alignItems: 'center',
    justifyContent: 'center',
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
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 8,
    paddingVertical: 13,
  },
  recentIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recentBottom: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim },
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
