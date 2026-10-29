import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QRCard } from '@/src/components/QRCard';
import {
  AppText,
  Avatar,
  Button,
  Card,
  IconButton,
  Pill,
  Stat,
} from '@/src/components/ui';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import {
  useFriends,
  useRespondFriendRequest,
  useSendFriendRequest,
} from '@/src/hooks/useFriends';
import { usePublicProfile, usePublicProfileVehicles } from '@/src/hooks/useProfile';
import { relationForTarget } from '@/src/lib/friends';
import { privacyLabel, profileColor } from '@/src/lib/profile-db';
import { profileUrl } from '@/src/lib/qr';
import { vehicleKindMeta } from '@/src/lib/vehicles';
import { colors, radius, spacing } from '@/src/theme';

export default function PublicProfileScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const { username } = useLocalSearchParams<{ username: string }>();
  const handle = (username || me.username).replace('@', '');
  const { profile, isLoading } = usePublicProfile(handle);
  const { vehicles: publicVehicles } = usePublicProfileVehicles(profile?.id);
  const { entries: friendEntries, isDemo } = useFriends();
  const sendFriendRequest = useSendFriendRequest();
  const respondFriendRequest = useRespondFriendRequest();
  const [friendError, setFriendError] = useState<string | null>(null);
  const primaryVehicle = publicVehicles[0];
  const isMe = profile?.id === me.id || profile?.username === me.username;
  const name = profile?.displayName ?? '';
  const color = profileColor(handle);
  const city = profile?.city || 'Santo Domingo, RD';
  const bio = profile?.bio || 'Rutas de fin de semana, café y buenas curvas.';
  const joinedYear = profile ? new Date(profile.createdAt).getFullYear() : null;
  const relation = profile ? relationForTarget(friendEntries, profile.id) : 'none';
  const incomingRequest = friendEntries.find(
    (entry) =>
      entry.profile.id === profile?.id &&
      entry.status === 'pending' &&
      entry.direction === 'incoming',
  );

  const share = async () => {
    await Share.share({
      message: `Perfil de ${name} en Caravana: ${profileUrl(handle)}`,
      url: profileUrl(handle),
    });
  };

  const addFriend = async () => {
    if (!profile) return;
    setFriendError(null);
    if (isDemo) {
      setFriendError('Las solicitudes de amistad se activan con una cuenta real.');
      return;
    }

    try {
      if (relation === 'incoming' && incomingRequest) {
        await respondFriendRequest.mutateAsync({ id: incomingRequest.id, accept: true });
      } else if (relation === 'none') {
        await sendFriendRequest.mutateAsync(profile.id);
      }
    } catch (error) {
      setFriendError(
        error instanceof Error ? error.message : 'No pudimos enviar la solicitud.',
      );
    }
  };

  const reportProfile = () => {
    Alert.alert(
      'Reportar perfil',
      'Si este perfil incumple las normas, guarda el usuario y envía el reporte desde Ayuda y soporte.',
      [{ text: 'Entendido', style: 'cancel' }],
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.notFound} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing.md }}>
          Cargando perfil…
        </AppText>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.notFound} edges={['top', 'bottom']}>
        <IconButton
          icon="arrow-back"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
        />
        <View style={styles.notFoundBody}>
          <View style={styles.notFoundIcon}>
            <Ionicons name="person-circle-outline" size={36} color={colors.accent} />
          </View>
          <AppText variant="h2" align="center" style={{ marginTop: spacing.lg }}>
            Este perfil no está disponible
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: 7 }}>
            Puede que el enlace esté incompleto o que el usuario haya cambiado su
            privacidad. Los QR de Caravana no muestran datos personales.
          </AppText>
          <Button
            label="Volver al inicio"
            variant="secondary"
            onPress={() => router.replace('/')}
            style={{ marginTop: spacing.xl }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
      >
        <View style={styles.header}>
        <IconButton icon="arrow-back" onPress={() => router.back()} />
        <Pill label="Perfil verificado por QR" tone="lime" icon="shield-checkmark" />
        <IconButton icon="share-social-outline" onPress={share} />
      </View>

      <View style={styles.hero}>
        <LinearGradient
          colors={['#2B160F', '#151A21', '#0B0F14']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBg}
        >
          <View style={styles.heroLine} />
        </LinearGradient>
        <View style={styles.heroContent}>
          <Avatar name={name} color={color} size={88} uri={profile.avatarUrl ?? undefined} ring={colors.bg} />
          <AppText variant="h1" align="center" style={{ marginTop: spacing.md }}>
            {name}
          </AppText>
          <AppText variant="caption" color={colors.accent} align="center">
            @{handle}
          </AppText>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.muted} />
            <AppText variant="caption" color={colors.muted}>{city}</AppText>
            {primaryVehicle ? (
              <>
                <View style={styles.dot} />
                <Ionicons name="car-sport-outline" size={13} color={colors.muted} />
                <AppText variant="caption" color={colors.muted}>
                  {primaryVehicle.make} {primaryVehicle.model} {primaryVehicle.year}
                </AppText>
              </>
            ) : null}
          </View>
          <AppText variant="body" color={colors.textSoft} align="center" style={{ marginTop: 10 }}>
            {bio}
          </AppText>

          <View style={styles.actions}>
            {isMe ? (
              <Button label="Compartir mi perfil" icon="share-outline" onPress={share} />
            ) : relation === 'friends' ? (
              <Button
                label="Ya son amigos"
                icon="checkmark-circle-outline"
                variant="secondary"
                disabled
              />
            ) : relation === 'outgoing' ? (
              <Button
                label="Solicitud enviada"
                icon="time-outline"
                variant="secondary"
                disabled
              />
            ) : relation === 'incoming' ? (
              <Button
                label="Aceptar solicitud"
                icon="person-add-outline"
                loading={respondFriendRequest.isPending}
                onPress={addFriend}
              />
            ) : (
              <Button
                label="Añadir amigo"
                icon="person-add-outline"
                loading={sendFriendRequest.isPending}
                onPress={addFriend}
              />
            )}
            {isMe ? (
              <Button
                label="Editar perfil"
                variant="secondary"
                icon="create-outline"
                onPress={() => router.push('/profile/edit')}
              />
            ) : primaryVehicle ? (
              <Button
                label="Ver vehículo"
                variant="secondary"
                icon="car-sport-outline"
                onPress={() => router.push(`/v/${primaryVehicle.qrSlug}`)}
              />
            ) : (
              <Button
                label="Compartir perfil"
                variant="secondary"
                icon="share-outline"
                onPress={share}
              />
            )}
          </View>
          {friendError ? (
            <AppText variant="caption" color={colors.accent} align="center" style={{ marginTop: 8 }}>
              {friendError}
            </AppText>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <Card style={styles.stats}>
          <View style={styles.statItem}>
            <Stat value={String(publicVehicles.length)} label="vehículos" align="center" />
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Stat value={joinedYear ? String(joinedYear) : '—'} label="en Caravana" align="center" />
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Stat
              value={privacyLabel(profile.privacy)}
              label="privacidad"
              accent={colors.lime}
              align="center"
            />
          </View>
        </Card>

        <View style={styles.qrRow}>
          <QRCard
            value={profileUrl(handle)}
            label="PÚBLICO"
            caption={`@${handle}`}
            size={118}
          />
          <View style={{ flex: 1, gap: 8 }}>
            <Card style={styles.privacyCard}>
              <View style={styles.privacyIcon}>
                <Ionicons name="eye-off-outline" size={18} color={colors.lime} />
              </View>
              <AppText variant="bodyStrong" style={{ marginTop: 8 }}>
                Privacidad primero
              </AppText>
              <AppText variant="caption" color={colors.muted} style={{ marginTop: 3 }}>
                Solo ves lo que {isMe ? 'tú' : name.split(' ')[0]} decide compartir. La ubicación
                en vivo nunca aparece aquí.
              </AppText>
            </Card>
            <PressableRow icon="flag-outline" label="Reportar perfil" onPress={reportProfile} />
          </View>
        </View>

        {primaryVehicle ? (
          <Pressable
            onPress={() => router.push(`/v/${primaryVehicle.qrSlug}`)}
            style={({ pressed }) => [{ opacity: pressed ? 0.82 : 1 }]}
          >
            <Card style={styles.carCard}>
              <View style={styles.carIcon}>
                <Ionicons
                  name={vehicleKindMeta[primaryVehicle.kind].icon}
                  size={24}
                  color={vehicleKindMeta[primaryVehicle.kind].color}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">
                  {primaryVehicle.make} {primaryVehicle.model} {primaryVehicle.year}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {primaryVehicle.nickname} · perfil público del vehículo
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.dim} />
            </Card>
          </Pressable>
        ) : (
          <Card style={styles.carCard}>
            <View style={styles.carIcon}>
              <Ionicons name="car-outline" size={24} color={colors.dim} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">Sin vehículos públicos</AppText>
              <AppText variant="caption" color={colors.muted}>
                El dueño no ha compartido ningún vehículo o su perfil es privado.
              </AppText>
            </View>
          </Card>
        )}

        <View style={styles.footerNote}>
          <Ionicons name="qr-code-outline" size={15} color={colors.dim} />
          <AppText variant="caption" color={colors.dim} align="center">
            Escaneaste el QR de {name.split(' ')[0]}. Los perfiles privados solo muestran una
            tarjeta mínima.
          </AppText>
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PressableRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.reportRow, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={16} color={colors.muted} />
      <AppText variant="caption" color={colors.muted} style={{ flex: 1 }}>{label}</AppText>
      <Ionicons name="chevron-forward" size={13} color={colors.dim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  notFound: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  notFoundBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  notFoundIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },
  hero: { marginTop: spacing.lg },
  heroBg: {
    height: 160,
    marginHorizontal: spacing.xl,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,90,31,0.2)',
    overflow: 'hidden',
  },
  heroLine: {
    position: 'absolute',
    left: -30,
    right: -30,
    top: 90,
    height: 1,
    backgroundColor: 'rgba(255,90,31,0.35)',
    transform: [{ rotate: '-8deg' }],
  },
  heroContent: {
    marginTop: -44,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, flexWrap: 'wrap', justifyContent: 'center' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.dim, marginHorizontal: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: spacing.lg, alignSelf: 'stretch' },
  body: { paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.lg },
  statItem: { flex: 1, alignItems: 'center' },
  divider: { width: 1, height: 30, backgroundColor: colors.border },
  qrRow: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  privacyCard: { flex: 1, padding: spacing.md },
  privacyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.limeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  carCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  carIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
});
