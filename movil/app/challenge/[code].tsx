import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { AppText, Avatar, Button, Card, IconButton, Pill } from '@/src/components/ui';
import { activeChallenge } from '@/src/data/mock';
import { useChallenges, useRespondChallenge } from '@/src/hooks/useChallenges';
import { showError } from '@/src/lib/alerts';
import { realChallengeToChallenge } from '@/src/lib/challenge-db';
import { profileColor } from '@/src/lib/profile-db';
import { useAuth } from '@/src/store/auth';
import { colors, radius, spacing } from '@/src/theme';
import { vehicleCategoryLabel, vehicleKindMeta } from '@/src/lib/vehicles';

export default function ChallengeInviteScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const account = useAuth((state) => state.account);
  const { challenges, isDemo, isLoading } = useChallenges();
  const respond = useRespondChallenge();
  const inviteCode = (code || (isDemo ? activeChallenge.code : '')).toUpperCase();
  // Solo se ven los retos en los que participas: la invitación ya te incluye.
  const real = challenges.find((item) => item.code.toUpperCase() === inviteCode) ?? null;
  const challenge = isDemo ? activeChallenge : real ? realChallengeToChallenge(real) : null;
  const realHost = real?.participants.find((participant) => participant.isHost);
  const host = isDemo
    ? activeChallenge.participants.find((participant) => !participant.isMe)
    : realHost
      ? {
          name: realHost.profile.displayName,
          color: profileColor(realHost.profile.username),
          vehicle: realHost.vehicleLabel,
          vehicleKind: realHost.vehicleKind,
        }
      : undefined;

  const accept = async () => {
    if (real && real.myStatus === 'invited') {
      try {
        await respond.mutateAsync({ challengeId: real.id, accept: true });
      } catch (error) {
        showError('No pudimos aceptar el reto', error);
        return;
      }
    }
    router.replace('/(tabs)/challenges');
  };

  if (!challenge) {
    const signedOut = !account;
    return (
      <SafeAreaView style={[styles.container, styles.stateScreen]} edges={['top', 'bottom']}>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Ionicons name={signedOut ? 'log-in-outline' : 'flag-outline'} size={32} color={colors.dim} />
            <AppText variant="h2" align="center">
              {signedOut ? 'Inicia sesión para ver el reto' : 'No encontramos este reto'}
            </AppText>
            <AppText variant="caption" color={colors.muted} align="center">
              {signedOut
                ? `Entra en Caravana con tu cuenta para aceptar el reto ${inviteCode}.`
                : 'Puede que haya terminado o que la invitación no sea para tu cuenta.'}
            </AppText>
            <Button
              label={signedOut ? 'Iniciar sesión' : 'Ir a Retos'}
              onPress={() => router.replace(signedOut ? '/welcome' : '/(tabs)/challenges')}
              style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
            />
          </>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
        <IconButton icon="close" onPress={() => router.back()} />
        <Pill label="Invitación a reto" tone="lime" icon="flag" />
        <View style={{ width: 42 }} />
      </View>

      <LinearGradient
        colors={['#17220F', '#151A21', '#0B0F14']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.glow} />
        <View style={styles.iconWrap}>
          <Ionicons name="flag" size={28} color={colors.lime} />
        </View>
        <AppText variant="label" color={colors.lime} style={{ marginTop: spacing.lg }}>
          TE RETAN A LLEGAR PRIMERO
        </AppText>
        <AppText variant="h1" align="center" style={{ marginTop: 6 }}>
          {challenge.title}
        </AppText>
        <View style={styles.destination}>
          <Ionicons name="navigate" size={13} color={colors.textSoft} />
          <AppText variant="caption" color={colors.textSoft}>
            {challenge.fromLabel} → {challenge.toLabel}
          </AppText>
        </View>

        <View style={styles.codeBox}>
          <AppText variant="label" color={colors.muted}>Código del reto</AppText>
          <AppText variant="h2" color={colors.lime} style={{ letterSpacing: 4 }}>
            {inviteCode}
          </AppText>
        </View>

        <View style={styles.routeBox}>
          <Svg width="100%" height={74} viewBox="0 0 300 74" preserveAspectRatio="none">
            <Path d="M0 20 C 50 20, 66 8, 112 16 S 190 54, 236 44 S 276 26, 300 28" stroke="#1C2834" strokeWidth={12} fill="none" />
            <Path
              d="M16 60 C 62 60, 70 32, 132 32 S 214 60, 286 18"
              stroke={colors.accent}
              strokeWidth={3}
              strokeDasharray="7 6"
              fill="none"
              strokeLinecap="round"
            />
            <Circle cx={16} cy={60} r={7} fill={colors.lime} />
            <Circle cx={286} cy={18} r={7} fill={colors.accent} />
          </Svg>
          <View style={styles.routeLabels}>
            <AppText variant="label" color={colors.lime} style={{ fontSize: 8 }}>SALIDA</AppText>
            <AppText variant="label" color={colors.accent} style={{ fontSize: 8 }}>META</AppText>
          </View>
        </View>

        {host ? (
          <View style={styles.hostRow}>
            <Avatar name={host.name} color={host.color} size={42} ring={colors.border} online />
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={colors.muted}>Te invita</AppText>
              <AppText variant="bodyStrong">{host.name}</AppText>
              <AppText variant="caption" color={colors.muted}>
                {host.vehicle} · {vehicleKindMeta[host.vehicleKind].shortLabel}
              </AppText>
            </View>
          </View>
        ) : null}

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Ionicons name="map-outline" size={18} color={colors.accent} />
            <AppText variant="h3">{challenge.distanceKm} km</AppText>
            <AppText variant="caption" color={colors.muted}>punto A → B</AppText>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaCell}>
            <Ionicons name="people-outline" size={18} color={colors.cyan} />
            <AppText variant="h3">{challenge.participants.length}</AppText>
            <AppText variant="caption" color={colors.muted}>participantes</AppText>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaCell}>
            <Ionicons name="shuffle" size={18} color={colors.lime} />
            <AppText variant="h3">{vehicleCategoryLabel(challenge.category)}</AppText>
            <AppText variant="caption" color={colors.muted}>categoría</AppText>
          </View>
        </View>

        <Button
          label={real && real.myStatus !== 'invited' ? 'Ver reto' : 'Aceptar reto'}
          icon="flag"
          loading={respond.isPending}
          onPress={() => void accept()}
          style={{ marginTop: spacing.xl }}
        />
        <Button
          label="Ahora no"
          variant="ghost"
          onPress={() => router.back()}
          style={{ marginTop: 8 }}
        />
      </LinearGradient>

      <Card style={styles.note}>
        <Ionicons name="shield-checkmark" size={20} color={colors.lime} />
        <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>
          Reto por llegada, no por velocidad. Respeta los límites y las normas. No hay apuestas
          ni rankings de velocidad máxima.
        </AppText>
      </Card>

        <View style={styles.footer}>
          <AppText variant="caption" color={colors.dim} align="center">
            Al aceptar compartes tu progreso solo con los participantes del reto.
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  stateScreen: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  card: {
    marginTop: spacing.xl,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.24)',
    padding: spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -130,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(201,255,77,0.08)',
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.limeSoft,
    borderWidth: 1,
    borderColor: 'rgba(201,255,77,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destination: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  codeBox: {
    marginTop: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.34)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  routeBox: {
    width: '100%',
    marginTop: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  routeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 2,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginTop: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  metaGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  metaCell: { flex: 1, alignItems: 'center', gap: 3 },
  metaDivider: { width: 1, height: 40, backgroundColor: colors.border },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: spacing.lg,
  },
  footer: { marginTop: spacing.lg, paddingBottom: spacing.sm },
});
