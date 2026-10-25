import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  currentUser,
  friends,
  recentChallenges,
  vehicles,
  type Challenge,
  type ChallengeCategory,
  type Friend,
} from '@/src/data/mock';
import { formatClock } from '@/src/lib/format';
import { challengeUrl } from '@/src/lib/qr';
import { colors, radius, spacing } from '@/src/theme';
import {
  vehicleCategoryLabel,
  vehicleKindMeta,
  vehicleKinds,
} from '@/src/lib/vehicles';

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
  const [active, setActive] = useState<Challenge>(activeChallenge);
  const [selectedRouteId, setSelectedRouteId] = useState(challengeRoutes[1].id);
  const [category, setCategory] = useState<ChallengeCategory>('mixed');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
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
    setMatchedFriend(null);
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
    const myVehicle =
      category === 'mixed'
        ? currentUser.car
        : vehicles.find((vehicle) => vehicle.kind === category) ?? currentUser.car;
    const newChallenge: Challenge = {
      id: `c_${Date.now()}`,
      code: `R${Math.floor(1000 + Math.random() * 9000)}`,
      title: `Reto ${route.fromLabel.split(',')[0]} → ${route.toLabel}`,
      fromLabel: route.fromLabel,
      toLabel: route.toLabel,
      distanceKm: route.distanceKm,
      category,
      status: 'pending',
      elapsedSeconds: 0,
      note:
        category === 'mixed'
          ? 'Categoría mixta. Cada vehículo corre con su propio ritmo y gana quien llegue primero respetando las normas.'
          : `Categoría ${vehicleCategoryLabel(category)}. Solo compiten vehículos de la misma clase.`,
      participants: [
        {
          id: currentUser.id,
          name: currentUser.name,
          username: currentUser.username,
          color: currentUser.color,
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
    await Share.share({
      message: `Te reto en Caravana: ${active.fromLabel} → ${active.toLabel} (${active.distanceKm} km). Únete con ${challengeUrl(active.code)}`,
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
        <Pill label="Modo emparejamiento" tone="lime" icon="git-compare-outline" />
        <Pill label="Punto A → punto B" tone="neutral" icon="flag-outline" />
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
            ? `En curso · ${standings.length} participantes · código ${active.code}`
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
        title="Modo emparejamiento"
        action="Cómo funciona"
        onAction={() =>
          Alert.alert(
            'Cómo funciona',
            'Elige una ruta A → B y una categoría. La app busca un amigo disponible de esa categoría o te deja elegir uno. Al aceptar, ambos comparten progreso y el primero en entrar en la meta gana. No se premia la velocidad máxima.',
          )
        }
      />
      <Card style={styles.matchCard}>
        <View style={styles.matchHeading}>
          <View style={styles.matchIcon}>
            <Ionicons name="git-compare-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title">Encuentra tu próximo reto</AppText>
            <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
              Elige ruta y categoría. Emparejamos un amigo disponible o eliges tú.
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
          <AppText variant="label" color={colors.muted} style={styles.stepLabel}>3 · RIVAL</AppText>
          <Pressable onPress={matchmake} style={styles.quickMatch} disabled={matching}>
            {matching ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="sparkles" size={14} color={colors.lime} />
            )}
            <AppText variant="label" color={colors.lime} style={{ fontSize: 9 }}>
              {matching ? 'BUSCANDO…' : 'EMPAREJAMIENTO RÁPIDO'}
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
              const selected = friend.id === selectedFriendId;
              return (
                <Pressable
                  key={friend.id}
                  onPress={() => {
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
