import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, Switch, View } from 'react-native';

import { QRCard } from '@/src/components/QRCard';
import {
  AppText,
  Avatar,
  Button,
  IconButton,
  Screen,
  SectionHeader,
  Stat,
} from '@/src/components/ui';
import { achievements as demoAchievements } from '@/src/data/mock';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useFriends } from '@/src/hooks/useFriends';
import { useMyProfile } from '@/src/hooks/useProfile';
import { tripAchievements, tripStats } from '@/src/lib/achievements';
import { showError } from '@/src/lib/alerts';
import { privacyLabel, profileColor } from '@/src/lib/profile-db';
import { profileUrl } from '@/src/lib/qr';
import { startTracking, stopTracking } from '@/src/lib/tracking';
import { useAuth } from '@/src/store/auth';
import { useSession } from '@/src/store/session';
import { useTrips } from '@/src/store/trips';
import { colors, radius, spacing } from '@/src/theme';

const settings = [
  { icon: 'lock-closed-outline' as const, label: 'Privacidad y ubicación', value: 'Amigos' },
  { icon: 'speedometer-outline' as const, label: 'Unidades y moneda', value: 'km · DOP' },
  { icon: 'notifications-outline' as const, label: 'Notificaciones', value: 'Activadas' },
  { icon: 'shield-checkmark-outline' as const, label: 'Seguridad', value: '' },
  { icon: 'help-circle-outline' as const, label: 'Ayuda y soporte', value: '' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const me = useCurrentUser();
  const { profile } = useMyProfile();
  const { friends: friendEntries } = useFriends();
  const account = useAuth((state) => state.account);
  const signOut = useAuth((state) => state.signOut);
  const busy = useAuth((state) => state.busy);
  const trackingEnabled = useSession((state) => state.trackingEnabled);
  const setTrackingEnabled = useSession((state) => state.setTrackingEnabled);
  const [showQr, setShowQr] = useState(false);
  const isDemo = account?.mode === 'demo';
  const trips = useTrips((state) => state.trips);
  const tripTotals = useTrips((state) => state.totals);
  const achievements = isDemo ? demoAchievements : tripAchievements(trips, tripTotals);
  const stats = isDemo ? me.stats : tripStats(tripTotals);
  const displayName = profile?.displayName || me.name;
  const username = profile?.username || me.username;
  const city = profile?.city || me.city;
  const bio = profile?.bio || me.bio;
  const privacy = profile?.privacy ?? (isDemo ? 'friends' : 'public');
  const avatarColor = profileColor(username);

  const shareProfile = async () => {
    await Share.share({
      message: `Mi perfil de Caravana: ${profileUrl(username)}`,
      url: profileUrl(username),
    });
  };

  const changeTracking = async (next: boolean) => {
    if (Platform.OS === 'web') {
      setTrackingEnabled(next);
      return;
    }
    try {
      if (next) await startTracking();
      else await stopTracking();
      setTrackingEnabled(next);
    } catch (error) {
      showError('No se pudo cambiar el tracking', error, 'Revisa los permisos de ubicación.');
    }
  };

  const leaveSession = async () => {
    await signOut();
  };

  const confirmSignOut = () => {
    if (Platform.OS === 'web') {
      void leaveSession();
      return;
    }

    Alert.alert(
      isDemo ? 'Salir del modo demo' : 'Cerrar sesión',
      isDemo
        ? 'Volverás a la pantalla de bienvenida. Los datos de la demo siguen en este dispositivo.'
        : 'Tendrás que iniciar sesión de nuevo para acceder a tus rutas y tu garaje.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: isDemo ? 'Salir' : 'Cerrar sesión',
          style: 'destructive',
          onPress: () => {
            void leaveSession();
          },
        },
      ],
    );
  };

  const profileSettings = settings.map((setting, index) =>
    index === 0 ? { ...setting, value: privacyLabel(privacy) } : setting,
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton icon="scan-outline" size={40} onPress={() => router.push('/scan')} />
        <IconButton icon="share-social-outline" size={40} onPress={shareProfile} />
      </View>

      <View style={styles.identity}>
        <Avatar
          name={displayName}
          color={avatarColor}
          size={88}
          uri={profile?.avatarUrl ?? me.avatarUrl}
        />
        <AppText variant="h1" align="center" style={{ marginTop: spacing.md }}>
          {displayName}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: 2 }}>
          @{username}
          {city ? ` · ${city}` : ''}
        </AppText>
        {bio ? (
          <AppText
            variant="body"
            color={colors.textSoft}
            align="center"
            style={{ marginTop: spacing.sm }}
          >
            {bio}
          </AppText>
        ) : null}
        <Button
          label="Editar perfil"
          variant="secondary"
          size="sm"
          full={false}
          onPress={() => router.push('/profile/edit')}
          style={{ marginTop: spacing.lg, alignSelf: 'center' }}
        />
      </View>

      <View style={styles.stats}>
        <Stat value={String(stats.drives)} label="rutas" align="center" />
        <Stat
          value={
            stats.km >= 1000 ? `${(stats.km / 1000).toFixed(1)}k` : String(Math.round(stats.km))
          }
          label="km"
          align="center"
        />
        <Stat value={`${stats.hours} h`} label="al volante" align="center" />
        <Stat value={String(friendEntries.length)} label="amigos" align="center" />
      </View>

      <SectionHeader
        title="Amigos"
        action={friendEntries.length > 0 ? 'Ver todos' : undefined}
        onAction={() => router.push('/friends')}
      />
      {friendEntries.length === 0 ? (
        <Group>
          <Row
            icon="person-add-outline"
            label="Buscar amigos"
            detail="Por @usuario o con tu QR"
            onPress={() => router.push('/friends')}
          />
        </Group>
      ) : (
        <View style={styles.friendRow}>
          {friendEntries.slice(0, 5).map((friend) => (
            <View key={friend.id} style={styles.friend}>
              <Avatar
                name={friend.profile.displayName}
                color={profileColor(friend.profile.username)}
                size={50}
                uri={friend.profile.avatarUrl ?? undefined}
              />
              <AppText variant="caption" color={colors.textSoft} numberOfLines={1}>
                {friend.profile.displayName.split(' ')[0]}
              </AppText>
            </View>
          ))}
          <Pressable
            onPress={() => router.push('/friends')}
            accessibilityRole="button"
            accessibilityLabel="Añadir amigos"
            style={styles.friend}
          >
            <View style={styles.friendAdd}>
              <Ionicons name="add" size={22} color={colors.textSoft} />
            </View>
            <AppText variant="caption" color={colors.muted}>
              Añadir
            </AppText>
          </Pressable>
        </View>
      )}

      {achievements.length > 0 ? (
        <>
          <SectionHeader title="Logros" />
          <Group>
            {achievements.map((achievement, index) => (
              <Row
                key={achievement.id}
                icon={achievement.icon}
                label={achievement.title}
                detail={achievement.detail}
                divider={index > 0}
              />
            ))}
          </Group>
        </>
      ) : null}

      <SectionHeader title="Mi QR" />
      <Group>
        <Row
          icon="qr-code-outline"
          label={showQr ? 'Ocultar mi QR' : 'Mostrar mi QR'}
          detail="Pégalo en el coche para que vean tu perfil"
          onPress={() => setShowQr((value) => !value)}
          chevron={showQr ? 'chevron-up' : 'chevron-down'}
        />
        {showQr ? (
          <View style={styles.qrWrap}>
            <QRCard
              value={profileUrl(username)}
              label="PERFIL"
              caption={`@${username}`}
              size={168}
            />
          </View>
        ) : null}
      </Group>

      <SectionHeader title="Ajustes" />
      <Group>
        <Row
          icon="navigate-outline"
          label="Tracking automático"
          detail="Detecta y guarda tus rutas"
          right={
            <Switch
              value={trackingEnabled}
              onValueChange={changeTracking}
              trackColor={{ false: colors.surfaceHigh, true: colors.green }}
              thumbColor={colors.white}
            />
          }
        />
        {profileSettings.map((setting, index) => (
          <Row
            key={setting.label}
            icon={setting.icon}
            label={setting.label}
            value={setting.value}
            divider
            onPress={() => {
              if (index === 0) {
                router.push('/profile/edit');
              } else {
                Alert.alert(
                  setting.label,
                  'Esta preferencia estará disponible en una próxima versión.',
                );
              }
            }}
          />
        ))}
        <Row
          icon="flask-outline"
          label="Simulador de pruebas"
          detail="Rutas, aparcamiento y party sin conducir"
          divider
          onPress={() => router.push('/simulador' as Href)}
        />
      </Group>

      <SectionHeader title="Cuenta" />
      <Group>
        <Row
          icon={isDemo ? 'phone-portrait-outline' : 'cloud-done-outline'}
          label={isDemo ? 'Modo demo' : 'Cuenta conectada'}
          detail={
            isDemo
              ? 'Datos solo en este dispositivo. Crea una cuenta para guardarlos en la nube.'
              : (account?.email ?? 'Sesión local')
          }
        />
        <Row
          icon="log-out-outline"
          label={busy ? 'Saliendo…' : isDemo ? 'Salir del modo demo' : 'Cerrar sesión'}
          divider
          onPress={busy ? undefined : confirmSignOut}
        />
        {!isDemo ? (
          <Row
            icon="trash-outline"
            label="Eliminar cuenta y datos"
            tone="danger"
            divider
            onPress={() => router.push('/account/delete' as Href)}
          />
        ) : null}
      </Group>

      <AppText variant="caption" color={colors.dim} align="center" style={styles.footer}>
        Caravana v0.1 · Tu ubicación solo se comparte dentro de una party.
      </AppText>
    </Screen>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Row({
  icon,
  label,
  detail,
  value,
  right,
  divider,
  tone,
  chevron = 'chevron-forward',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  value?: string;
  right?: ReactNode;
  divider?: boolean;
  tone?: 'danger';
  chevron?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  const color = tone === 'danger' ? colors.danger : colors.text;
  const content = (
    <>
      <Ionicons name={icon} size={20} color={tone === 'danger' ? colors.danger : colors.textSoft} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color={color}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="caption" color={colors.muted} style={{ marginTop: 1 }}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="caption" color={colors.muted}>
          {value}
        </AppText>
      ) : null}
      {right}
      {onPress && !right ? <Ionicons name={chevron} size={16} color={colors.dim} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, divider && styles.rowDivider]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  identity: { alignItems: 'center', marginTop: spacing.sm },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing['2xl'],
    paddingVertical: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  friendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  friend: { alignItems: 'center', gap: 6, width: 52 },
  friendAdd: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSoft,
  },
  qrWrap: { alignItems: 'center', paddingBottom: spacing.lg },
  footer: { marginTop: spacing['2xl'], marginBottom: spacing.xl },
});
