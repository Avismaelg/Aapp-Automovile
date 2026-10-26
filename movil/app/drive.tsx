import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { PTTButton } from '@/src/components/PTTButton';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Pill,
} from '@/src/components/ui';
import { activeChallenge, activeParty, partyMembers } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { formatClock } from '@/src/lib/format';
import { colors, radius, spacing } from '@/src/theme';

function DriveRoute({ compact }: { compact?: boolean }) {
  return (
    <View style={styles.routeWrap}>
      <Svg
        width="100%"
        height={compact ? 70 : 104}
        viewBox="0 0 340 104"
        preserveAspectRatio="none"
      >
        <Path
          d="M0 80 C 52 70, 62 28, 120 38 S 206 86, 254 48 S 306 16, 340 22"
          stroke="#1C2631"
          strokeWidth={18}
          fill="none"
        />
        <Path
          d="M8 82 C 58 72, 66 32, 122 42 S 208 88, 256 50 S 308 20, 334 24"
          stroke={colors.accent}
          strokeWidth={3}
          strokeDasharray="7 7"
          fill="none"
          strokeLinecap="round"
        />
        <Circle cx={8} cy={82} r={7} fill={colors.lime} />
        <Circle cx={334} cy={24} r={7} fill={colors.accent} />
      </Svg>
      <View style={styles.routeLabels}>
        <View>
          <AppText variant="label" color={colors.lime} style={{ fontSize: 8 }}>SALIDA</AppText>
          <AppText variant="caption" color={colors.textSoft}>Santo Domingo</AppText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <AppText variant="label" color={colors.accent} style={{ fontSize: 8 }}>META</AppText>
          <AppText variant="caption" color={colors.textSoft}>{activeParty.destination.split(',')[0]}</AppText>
        </View>
      </View>
    </View>
  );
}

export default function DriveScreen() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [partyTime, setPartyTime] = useState(activeParty.elapsedSeconds);
  const [challengeTime, setChallengeTime] = useState(activeChallenge.elapsedSeconds);
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setPartyTime((value) => value + 1);
      setChallengeTime((value) => value + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const standings = useMemo(
    () => [...activeChallenge.participants].sort((a, b) => b.progress - a.progress),
    [],
  );
  const me = standings.find((participant) => participant.isMe);
  const leader = standings[0];

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
      <LinearGradient
        colors={['#19100C', '#0A0E13', '#06080B']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          <View style={styles.topBar}>
            <View>
              <View style={styles.brandRow}>
                <View style={styles.brandDot} />
                <AppText variant="label" color={colors.accent} style={{ letterSpacing: 2 }}>
                  CARAVANA
                </AppText>
              </View>
              <AppText variant={landscape ? 'h2' : 'h1'} style={{ marginTop: 4 }}>
                Modo conducción
              </AppText>
            </View>
            <View style={styles.topActions}>
              {landscape ? (
                <Pill label="Pantalla simplificada" tone="lime" icon="car-sport" />
              ) : null}
              <IconButton
                icon="close"
                size={46}
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace('/(tabs)');
                }}
              />
            </View>
          </View>

          <View style={[styles.layout, landscape && styles.layoutLandscape]}>
            <View style={[styles.mainColumn, landscape && styles.mainColumnLandscape]}>
              <Card style={[styles.partyCard, landscape && styles.partyCardLandscape]}>
                <View style={styles.cardTop}>
                  <Pill label="Party en vivo" tone="danger" icon="radio" />
                  <Pill label={`${partyMembers.length} vehículos`} tone="dark" icon="people" />
                </View>
                <AppText variant="h2" style={{ marginTop: spacing.md }}>
                  {activeParty.name}
                </AppText>
                <View style={styles.destination}>
                  <Ionicons name="navigate" size={16} color={colors.accent} />
                  <AppText variant="bodyStrong" color={colors.textSoft}>
                    {activeParty.destination}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    ETA {activeParty.etaMin} min
                  </AppText>
                </View>
                <DriveRoute compact={landscape} />
                <View style={styles.partyMeta}>
                  <View style={styles.metaBlock}>
                    <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>TIEMPO</AppText>
                    <AppText variant="mono" color={colors.lime} style={{ fontSize: 18 }}>
                      {formatClock(partyTime)}
                    </AppText>
                  </View>
                  <View style={styles.metaDivider} />
                  <View style={styles.metaBlock}>
                    <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>DISTANCIA</AppText>
                    <AppText variant="h3">{activeParty.distanceKm} km</AppText>
                  </View>
                  <View style={styles.metaDivider} />
                  <View style={styles.metaBlock}>
                    <AppText variant="label" color={colors.muted} style={{ fontSize: 8 }}>MIEMBROS</AppText>
                    <AppText variant="h3">{partyMembers.length}</AppText>
                  </View>
                </View>
              </Card>

              {!landscape ? (
                <View style={styles.crewRow}>
                  {partyMembers.slice(0, 4).map((member) => (
                    <View key={member.id} style={styles.crewMember}>
                      <Avatar
                        name={member.name}
                        color={member.color}
                        size={42}
                        online
                        ring={member.isTalking ? colors.accent : colors.border}
                      />
                      <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
                        {member.username === currentUser.username
                          ? 'Tú'
                          : member.name.split(' ')[0]}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={[styles.sideColumn, landscape && styles.sideColumnLandscape]}>
              <Card style={[styles.pttCard, landscape && styles.pttCardLandscape]}>
                <PTTButton
                  talking={talking}
                  onPressIn={startTalking}
                  onPressOut={stopTalking}
                  compact={landscape}
                />
              </Card>

              <Card style={[styles.challengeCard, landscape && styles.challengeCardLandscape]}>
                <View style={styles.cardTop}>
                  <Pill label="Reto en curso" tone="accent" icon="flag" />
                  <AppText variant="mono" color={colors.accent}>
                    {formatClock(challengeTime)}
                  </AppText>
                </View>
                <AppText variant="title" style={{ marginTop: spacing.sm }} numberOfLines={1}>
                  {activeChallenge.title}
                </AppText>
                <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                  {activeChallenge.fromLabel} → {activeChallenge.toLabel}
                </AppText>

                <View style={styles.challengeStandings}>
                  {standings.slice(0, landscape ? 2 : 3).map((participant, index) => (
                    <View key={participant.id} style={styles.standingRow}>
                      <AppText variant="label" color={index === 0 ? colors.lime : colors.muted} style={{ width: 14 }}>
                        {index + 1}
                      </AppText>
                      <Avatar name={participant.name} color={participant.color} size={28} />
                      <AppText variant="caption" color={participant.isMe ? colors.accent : colors.textSoft} numberOfLines={1} style={{ flex: 1 }}>
                        {participant.isMe ? 'Tú' : participant.name.split(' ')[0]}
                      </AppText>
                      <View style={styles.miniTrack}>
                        <View
                          style={[
                            styles.miniFill,
                            {
                              width: `${participant.progress}%`,
                              backgroundColor: participant.isMe ? colors.accent : colors.lime,
                            },
                          ]}
                        />
                      </View>
                      <AppText variant="caption" color={colors.textSoft}>{participant.progress}%</AppText>
                    </View>
                  ))}
                </View>
                <AppText variant="caption" color={colors.dim} style={{ marginTop: spacing.sm }}>
                  {me ? `Tu posición: ${standings.findIndex((item) => item.isMe) + 1} de ${standings.length}` : ''}
                  {leader ? ` · Lidera ${leader.isMe ? 'tú' : leader.name.split(' ')[0]}` : ''}
                </AppText>
              </Card>

              {!landscape ? (
                <View style={styles.primaryActions}>
                  <Button
                    label="Abrir party"
                    icon="radio"
                    onPress={() => router.push('/(tabs)/party')}
                    size="lg"
                  />
                  <Button
                    label="Ver clasificación"
                    icon="podium-outline"
                    variant="secondary"
                    onPress={() => router.push('/(tabs)/challenges')}
                  />
                </View>
              ) : null}
            </View>
          </View>

          <Pressable
            onPress={() => router.replace('/(tabs)')}
            style={({ pressed }) => [styles.exitRow, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
            <AppText variant="caption" color={colors.muted}>
              Salir del modo conducción
            </AppText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  layout: { gap: spacing.md, marginTop: spacing.lg },
  layoutLandscape: { flexDirection: 'row', alignItems: 'flex-start' },
  mainColumn: { gap: spacing.md },
  sideColumn: { gap: spacing.md },
  mainColumnLandscape: { flex: 1 },
  sideColumnLandscape: { flex: 1 },
  partyCard: { padding: spacing.lg },
  partyCardLandscape: { padding: spacing.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  destination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  routeWrap: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  routeLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginTop: 2,
  },
  partyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  metaBlock: { flex: 1, gap: 2 },
  metaDivider: { width: 1, height: 32, backgroundColor: colors.border, marginHorizontal: spacing.sm },
  crewRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: 4,
  },
  crewMember: { alignItems: 'center', gap: 4, width: 54 },
  pttCard: { alignItems: 'center', paddingVertical: spacing.lg },
  pttCardLandscape: { paddingVertical: spacing.sm },
  challengeCard: { padding: spacing.lg },
  challengeCardLandscape: { padding: spacing.md },
  challengeStandings: { marginTop: spacing.md, gap: 4 },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
  },
  miniTrack: {
    width: 54,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  miniFill: { height: '100%', borderRadius: 2 },
  primaryActions: { gap: 8 },
  exitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
    paddingVertical: 12,
  },
});
